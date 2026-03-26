# 📋 memobank-cli 混合检索增强方案

## 技术规格说明书 (Specification)

**版本**: v1.0-draft  
**日期**: 2026-03-26  
**范围**: 在 LanceDB Engine 中实现 BM25 + Vector 混合检索

---

## 1. 概述

### 1.1 目标

为 memobank-cli 的 LanceDB 引擎添加 **BM25 全文检索**能力，与现有向量检索融合，实现混合检索 (Hybrid Search)，提升对精确关键词（错误码、包名、API 名称等）的召回质量。

### 1.2 当前问题

当前 `lancedb-engine.ts` 的 `search()` 方法仅使用向量检索：

```typescript
// 当前实现（第 194-201 行）
const queryResult = await this.table
  .query()
  .nearestTo(queryEmbedding)
  .limit(topK * 2)
  .toArray();
```

**缺陷：**

- 对错误码（如 `ERR_PNPM_PEER_DEP`）检索效果差
- 对专有名词（包名、API 名称）匹配不精确
- 无法利用 LanceDB 内置的 FTS (Full-Text Search) 能力

### 1.3 预期效果

| 查询类型                 | 当前（纯向量）               | 改进后（混合）               |
| ------------------------ | ---------------------------- | ---------------------------- |
| "pnpm 安装失败"          | 语义相关但可能无精确匹配     | 精确匹配包含 "pnpm" 的记忆   |
| "ERR_PNPM_PEER_DEP 解决" | 可能召回泛化的"安装错误"记忆 | 精确召回包含该错误码的记忆   |
| "汽车和 automobile 区别" | ✅ 语义理解好                | ✅ 保持语义理解 + 关键词匹配 |

---

## 2. 技术方案

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    LanceDbEngine.search()               │
└─────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────┐                   ┌─────────────────┐
│   Vector Search │                   │    BM25 FTS     │
│  (nearestTo)    │                   │  (fullTextSearch)│
│  topK * 2       │                   │  topK * 2       │
└────────┬────────┘                   └────────┬────────┘
         │                                     │
         │  RecallResult[]                     │  RecallResult[]
         │  vectorScore                        │  bm25Score
         └──────────────────┬──────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Hybrid Fusion  │
                   │  加权融合        │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Decay Adjust   │
                   │  (已有逻辑)     │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Sort & Top-K   │
                   │  返回最终结果    │
                   └─────────────────┘
```

### 2.2 核心公式

**混合分数计算：**

```
finalScore = vectorScore × α + bm25Score × (1 - α) + decayScore × β
```

**默认权重：**

- `α` (vectorWeight) = 0.7
- `bm25Weight` = 0.3
- `β` (decayWeight) = 0.3（与现有 decay 逻辑一致）

**归一化处理：**

```
normalizedVectorScore = vectorScore / maxVectorScore
normalizedBm25Score = bm25Score / maxBm25Score
```

---

## 3. 详细设计

### 3.1 配置扩展

**文件**: `src/config.ts`

**新增配置项**（在 `MemoConfig` 中）：

```typescript
// 在 embedding 配置中添加
embedding: {
  engine: Engine;
  provider?: string;
  model?: string;
  dimensions?: number;
  base_url?: string;
  // 新增：混合检索权重配置
  hybrid?: {
    vectorWeight?: number;      // 默认 0.7
    bm25Weight?: number;        // 默认 0.3
    enabled?: boolean;          // 默认 true（当 engine='lancedb' 时）
  };
}
```

**默认配置**：

```typescript
const DEFAULT_CONFIG: MemoConfig = {
  // ... 现有配置
  embedding: {
    engine: 'text',
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    hybrid: {
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      enabled: true,
    },
  },
};
```

### 3.2 LanceDB Schema 变更

**文件**: `src/engines/lancedb-engine.ts`

**当前 Schema**（隐式，由插入数据推断）：

```typescript
interface LanceDbRecord {
  id: string;
  path: string;
  name: string;
  description: string;
  tags: string; // 逗号分隔的字符串
  content: string;
  contentHash: string;
  vector: number[]; // 向量字段
  created: string;
  updated: string;
  confidence: string;
}
```

**变更**：无需修改 Schema，LanceDB FTS 自动索引所有文本字段。

**FTS 索引创建**（在 `index()` 方法中）：

```typescript
// 在 vector index 创建后，添加 FTS index
await this.table.createIndex('fts', {
  config: lancedb.Index.fts({
    tokenizers: ['raw'], // 支持中文分词
    with_position: false,
  }),
});
```

### 3.3 检索逻辑实现

**文件**: `src/engines/lancedb-engine.ts`

**修改的 `search()` 方法**（第 186-224 行）：

```typescript
async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]> {
  await this.init();

  if (this.table === null) {
    return [];
  }

  try {
    // ========== 1. 向量检索 ==========
    const queryEmbedding = await this.embeddingGenerator.generateEmbedding(query);

    const vectorResults = await this.table
      .query()
      .nearestTo(queryEmbedding)
      .limit(topK * 2)  // 获取 2 倍候选，融合后取 topK
      .toArray();

    // ========== 2. BM25 全文检索 ==========
    const bm25Results = await this.table
      .query()
      .where(`fts_match('${this.escapeFtsQuery(query)}')`)
      .limit(topK * 2)
      .toArray();

    // ========== 3. 融合结果 ==========
    const results = this.hybridFusion(vectorResults, bm25Results, topK);

    // ========== 4. 应用衰减调整（已有逻辑） ==========
    const adjustedResults = results.map((result) => {
      const decayScore = computeDecayScore(result.memory);
      const finalScore = result.score * 0.7 + decayScore * 0.3;
      return { ...result, score: finalScore };
    });

    // ========== 5. 排序并返回 Top-K ==========
    adjustedResults.sort((a, b) => b.score - a.score);
    return adjustedResults.slice(0, topK);

  } catch (error) {
    console.warn(
      `LanceDB search failed, falling back to text engine: ${(error as Error).message}`
    );
    return [];
  }
}
```

**新增辅助方法**：

```typescript
/**
 * 混合融合 Vector 和 BM25 结果
 */
private hybridFusion(
  vectorResults: any[],
  bm25Results: any[],
  topK: number
): RecallResult[] {
  const config = this.getHybridConfig();
  const vectorWeight = config.vectorWeight;
  const bm25Weight = config.bm25Weight;

  // 构建 path → result 映射
  const resultMap = new Map<string, { vectorScore: number; bm25Score: number; memory: MemoryFile }>();

  // 处理向量结果
  const maxVectorScore = Math.max(...vectorResults.map(r => 1 - ((r as any)._distance ?? 0)), 1e-6);
  for (const row of vectorResults) {
    const memory = this.rowToMemory(row);
    const distance = (row as any)._distance as number | undefined;
    const normalizedScore = (1 - (distance ?? 0)) / maxVectorScore;
    resultMap.set(memory.path, {
      vectorScore: normalizedScore,
      bm25Score: 0,  // 未出现在 BM25 结果中
      memory,
    });
  }

  // 处理 BM25 结果（需要 LanceDB 返回 BM25 分数）
  const maxBm25Score = Math.max(...bm25Results.map(r => (r as any)._score ?? 1), 1e-6);
  for (const row of bm25Results) {
    const memory = this.rowToMemory(row);
    const bm25Score = (row as any)._score ?? 1;
    const normalizedScore = bm25Score / maxBm25Score;

    if (resultMap.has(memory.path)) {
      // 融合：更新已有记录的 BM25 分数
      const existing = resultMap.get(memory.path)!;
      existing.bm25Score = normalizedScore;
    } else {
      // BM25 独有结果
      resultMap.set(memory.path, {
        vectorScore: 0,  // 未出现在向量结果中
        bm25Score: normalizedScore,
        memory,
      });
    }
  }

  // 计算混合分数并转换为 RecallResult[]
  const fusedResults: RecallResult[] = Array.from(resultMap.values()).map(({ vectorScore, bm25Score, memory }) => ({
    memory,
    score: vectorScore * vectorWeight + bm25Score * bm25Weight,
  }));

  // 按混合分数排序
  fusedResults.sort((a, b) => b.score - a.score);

  return fusedResults.slice(0, topK);
}

/**
 * 获取混合检索配置
 */
private getHybridConfig(): { vectorWeight: number; bm25Weight: number } {
  // 从配置文件读取，或使用默认值
  return {
    vectorWeight: 0.7,
    bm25Weight: 0.3,
  };
}

/**
 * 转义 FTS 查询字符串（防止特殊字符）
 */
private escapeFtsQuery(query: string): string {
  return query.replace(/["\\]/g, '\\$&');
}
```

### 3.4 索引增强

**文件**: `src/engines/lancedb-engine.ts`

**修改的 `index()` 方法**（在 vector index 创建后添加 FTS index）：

```typescript
// 创建 vector index（现有逻辑，第 170-177 行）
try {
  await this.table.createIndex('vector', {
    config: lancedb.Index.ivfPq({
      numPartitions: Math.max(1, Math.floor(memories.length / 100)),
      numSubVectors: Math.floor(this.embeddingGenerator.getDimensions() / 8),
    }),
  });
} catch {
  // Index may already exist, ignore
}

// ========== 新增：创建 FTS index ==========
try {
  await this.table.createIndex('fts', {
    config: lancedb.Index.fts({
      tokenizers: ['raw'], // 支持中文分词
      with_position: false, // 不需要位置信息，节省空间
    }),
  });
  console.log('Created FTS index for BM25 search');
} catch (error) {
  console.warn(`FTS index creation failed: ${(error as Error).message}`);
  // FTS 失败不影响 vector search，继续执行
}
```

### 3.5 配置验证与降级策略

**文件**: `src/engines/lancedb-engine.ts`

**新增配置验证**（在 `init()` 方法中）：

```typescript
private async init(): Promise<void> {
  if (this.db !== null) {
    return;
  }

  try {
    lancedb = await import('@lancedb/lancedb');

    const uri = path.join(this.dbPath, this.indexDirName);
    this.db = await lancedb.connect(uri);

    try {
      this.table = await this.db.openTable(this.tableName);

      // 验证 FTS 索引是否存在
      const hasFtsIndex = await this.hasFtsIndex();
      if (!hasFtsIndex) {
        console.warn('FTS index not found. BM25 search will be unavailable.');
        console.warn('Run `memo index --rebuild` to create FTS index.');
      }
    } catch {
      this.table = null;
    }
  } catch (error) {
    throw new Error(`Failed to initialize LanceDB: ${(error as Error).message}`);
  }
}

/**
 * 检查 FTS 索引是否存在
 */
private async hasFtsIndex(): Promise<boolean> {
  try {
    const indices = await this.table.listIndices();
    return indices.some((idx: any) => idx.index_type === 'fts');
  } catch {
    return false;
  }
}
```

**降级策略**（在 `search()` 中）：

```typescript
// 如果 FTS 不可用，降级为纯向量检索
const bm25Available = await this.hasFtsIndex();
if (!bm25Available) {
  console.warn('BM25 search unavailable, using vector-only search');
  // 仅执行向量检索
}
```

---

## 4. 配置与用户接口

### 4.1 配置文件示例

**文件**: `meta/config.yaml`

```yaml
project:
  name: my-project

embedding:
  engine: lancedb
  provider: openai
  model: text-embedding-3-small
  dimensions: 1536

# 新增：混合检索配置
search:
  hybrid:
    enabled: true
    vectorWeight: 0.7
    bm25Weight: 0.3

memory:
  token_budget: 500
  top_k: 5
```

### 4.2 命令行接口（可选增强）

**新增命令选项**（`memo search` 和 `memo recall`）：

```bash
# 使用混合检索（默认）
memo search "pnpm ERR_PNPM_PEER_DEP"

# 强制使用纯向量检索
memo search "pnpm ERR_PNPM_PEER_DEP" --engine vector

# 强制使用纯 BM25 检索
memo search "pnpm ERR_PNPM_PEER_DEP" --engine bm25

# 调整权重
memo search "pnpm ERR_PNPM_PEER_DEP" --vector-weight 0.5 --bm25-weight 0.5
```

**实现位置**: `src/commands/search.ts`

---

## 5. 测试计划

### 5.1 单元测试

**文件**: `tests/lancedb-hybrid-search.test.ts`（新建）

```typescript
describe('LanceDbEngine Hybrid Search', () => {
  it('should fuse vector and BM25 results correctly', async () => {
    // 测试融合逻辑
  });

  it('should handle BM25-only results', async () => {
    // 测试 BM25 独有的精确匹配
  });

  it('should handle vector-only results', async () => {
    // 测试向量独有的语义匹配
  });

  it('should apply correct weighting', async () => {
    // 测试权重配置生效
  });

  it('should degrade gracefully when FTS unavailable', async () => {
    // 测试降级策略
  });
});
```

### 5.2 集成测试

**测试场景**：

1. 索引 100 条记忆（包含错误码、包名、通用文本）
2. 执行混合检索查询
3. 验证 Top-10 结果的相关性

**测试查询示例**：

- "ERR_PNPM_PEER_DEP"（精确错误码）
- "pnpm vs npm"（包名对比）
- "如何优化构建速度"（语义查询）
- "typescript 5.0 新特性"（版本 + 语义）

### 5.3 性能基准

| 指标                       | 目标    |
| -------------------------- | ------- |
| 检索延迟（100 条记忆）     | < 100ms |
| 检索延迟（1000 条记忆）    | < 500ms |
| FTS 索引创建时间（100 条） | < 5s    |

---

## 6. 迁移与兼容性

### 6.1 向后兼容

- **现有用户**：无需迁移，FTS 索引在下次 `memo index` 时自动创建
- **配置兼容**：`hybrid` 配置为可选，默认启用
- **降级策略**：FTS 不可用时自动降级为纯向量检索

### 6.2 升级路径

**现有用户升级步骤**：

```bash
# 1. 升级到新版本
npm install -g memobank-cli@latest

# 2. 重建索引（创建 FTS 索引）
memo index --rebuild

# 3. 验证
memo search "test query" --explain
```

### 6.3 数据迁移

**无需数据迁移**：

- 现有 LanceDB 数据格式不变
- FTS 索引自动创建
- 历史记忆自动可搜索

---

## 7. 风险与缓解

| 风险               | 影响                 | 缓解措施                                      |
| ------------------ | -------------------- | --------------------------------------------- |
| LanceDB 版本兼容性 | FTS API 可能变化     | 锁定 `@lancedb/lancedb@^0.15.0`，添加版本检查 |
| 中文分词效果差     | BM25 对中文支持不佳  | 使用 `raw` tokenizer，测试中文查询效果        |
| 索引体积增大       | FTS 索引占用额外空间 | 设置 `with_position: false` 减少空间          |
| 检索延迟增加       | 双重检索可能变慢     | 限制 `topK * 2` 候选数，并行执行              |
| 配置复杂化         | 用户需要理解权重     | 提供合理默认值，添加文档说明                  |

---

## 8. 实施计划

### Phase 1：核心实现（1-2 周）

| 任务                                  | 预计时间 |
| ------------------------------------- | -------- |
| 修改 `lancedb-engine.ts` 实现混合检索 | 3 天     |
| 添加 FTS 索引创建逻辑                 | 1 天     |
| 实现 `hybridFusion()` 融合方法        | 2 天     |
| 添加配置解析与验证                    | 1 天     |
| 编写单元测试                          | 2 天     |

### Phase 2：测试与优化（1 周）

| 任务                        | 预计时间 |
| --------------------------- | -------- |
| 集成测试（100/1000 条记忆） | 2 天     |
| 性能基准测试                | 1 天     |
| 中文查询效果调优            | 2 天     |

### Phase 3：文档与发布（3-5 天）

| 任务                        | 预计时间 |
| --------------------------- | -------- |
| 更新 README（混合检索说明） | 1 天     |
| 编写配置指南                | 1 天     |
| 发布新版本                  | 1 天     |

---

## 9. 验收标准

### 功能验收

- [ ] 混合检索返回结果包含向量 + BM25 融合分数
- [ ] 精确查询（错误码、包名）的 Top-1 准确率提升 ≥ 30%
- [ ] 语义查询效果不下降（与纯向量检索对比）
- [ ] FTS 索引失败时自动降级为向量检索

### 性能验收

- [ ] 100 条记忆检索延迟 < 100ms
- [ ] 1000 条记忆检索延迟 < 500ms
- [ ] FTS 索引创建时间 < 5s（100 条记忆）

### 兼容性验收

- [ ] 现有用户无需手动迁移
- [ ] 配置项可选，默认启用
- [ ] 所有现有测试通过

---

## 10. 附录

### A. LanceDB FTS 文档参考

- [LanceDB Full-Text Search](https://lancedb.github.io/lancedb/search/#full-text-search)
- [FTS Index Configuration](https://lancedb.github.io/lancedb/python/python/#lancedb.index.FTS)

### B. 参考实现

- memory-lancedb-pro 的 BM25 实现（`src/store.ts` 中的 `bm25Search()`）
- LanceDB 官方示例（`examples/fts/`）

### C. 配置参数调优指南

| 参数           | 推荐值  | 说明                               |
| -------------- | ------- | ---------------------------------- |
| `vectorWeight` | 0.6-0.8 | 语义查询多调高，精确查询多调低     |
| `bm25Weight`   | 0.2-0.4 | 与 `vectorWeight` 之和为 1         |
| `topK * 2`     | 10-20   | 融合候选数，越大融合效果越好但越慢 |

---

## 11. 总结

本方案通过在 memobank-cli 的 LanceDB 引擎中实现 **BM25 + Vector 混合检索**，显著提升对精确关键词（错误码、包名、API 名称）的召回质量，同时保持语义检索的优势。

**核心优势**：

- ✅ 利用 LanceDB 内置 FTS，实现成本低
- ✅ 加权融合策略简单有效
- ✅ 向后兼容，无需数据迁移
- ✅ 降级策略完善，FTS 失败不影响使用

**预期收益**：

- 精确查询准确率提升 ≥ 30%
- 用户检索体验显著改善
- 保持 memobank-cli 的简洁性和 Git 原生优势
