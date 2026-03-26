# 🧠 智能去重机制

## 技术规格说明书 (Specification)

**版本**: v1.0-draft  
**日期**: 2026-03-26  
**范围**: 在 `memo capture` 中实现 LLM 语义级去重

---

## 1. 概述

### 1.1 目标

改进当前仅基于 `name hash` 的去重机制，实现**语义级智能去重**，避免用户多次记录相似记忆导致冗余。

### 1.2 当前问题

**当前实现**（`src/commands/capture.ts` 第 28-32 行）：

```typescript
function isDuplicate(name: string, existingMemories: MemoryFile[]): boolean {
  const hash = hashString(name);
  return existingMemories.some((m) => hashString(m.name) === hash);
}
```

**缺陷**：

- "用 pnpm 替代 npm" 和 "包管理器选择 pnpm" 被视为不同记忆
- 用户多次 capture 相似内容时产生冗余
- 无法识别信息演化（同一决策的补充说明）

### 1.3 预期效果

| 场景                             | 当前行为        | 改进后行为        |
| -------------------------------- | --------------- | ----------------- |
| 第一次 capture "用 pnpm"         | ✅ 创建         | ✅ 创建           |
| 第二次 capture "包管理器选 pnpm" | ❌ 创建（重复） | ⚠️ 提示合并/跳过  |
| 第三次 capture "pnpm 安装更快"   | ❌ 创建（重复） | ✅ 合并到已有记忆 |

---

## 2. 技术方案

### 2.1 两阶段去重架构

```
┌─────────────────────────────────────────────────────────┐
│                    capture()                            │
│              提取 N 条候选记忆                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────┐
         │    Stage 1: 向量相似度预过滤     │
         │    - 计算候选记忆的 embedding     │
         │    - 与现有记忆比较相似度        │
         │    - 相似度 ≥ 0.85 → 进入 Stage 2│
         └──────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────┐
         │    Stage 2: LLM 语义决策         │
         │    - 输入：候选 + 相似记忆       │
         │    - 输出：CREATE / MERGE / SKIP │
         └──────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ CREATE  │       │  MERGE  │       │  SKIP   │
    │ 新建    │       │ 合并更新│       │ 跳过    │
    └─────────┘       └─────────┘       └─────────┘
```

### 2.2 核心公式

**向量相似度计算**：

```
similarity = cosineSimilarity(candidateEmbedding, existingEmbedding)
```

**阈值设定**：

- `similarity ≥ 0.85` → 进入 LLM 语义决策
- `0.70 ≤ similarity < 0.85` → 可选：提示用户确认
- `similarity < 0.70` → 判定为新记忆

---

## 3. 详细设计

### 3.1 配置扩展

**文件**: `src/config.ts`

**新增配置项**：

```yaml
# meta/config.yaml
dedup:
  enabled: true
  vectorSimilarityThreshold: 0.85 # 向量相似度阈值
  useLlmDecision: true # 是否使用 LLM 语义决策
  llmModel: claude-3-5-sonnet-20241022
```

### 3.2 核心模块设计

#### 3.2.1 去重引擎接口

**文件**: `src/core/dedup-engine.ts`（新建）

```typescript
export interface DedupCandidate {
  name: string;
  type: MemoryType;
  description: string;
  content: string;
  embedding?: number[];
}

export interface DedupResult {
  action: 'CREATE' | 'MERGE' | 'SKIP';
  reason: string;
  similarMemory?: MemoryFile; // 最相似的现有记忆
  similarityScore?: number;
  mergedContent?: string; // MERGE 时的合并后内容
}

export interface DedupEngineOptions {
  similarityThreshold?: number; // 默认 0.85
  useLlm?: boolean; // 默认 true
  llmApiKey?: string;
  llmModel?: string;
}

export class DedupEngine {
  private embeddingGenerator: EmbeddingGenerator;
  private options: DedupEngineOptions;

  constructor(embeddingGenerator: EmbeddingGenerator, options?: DedupEngineOptions);

  /**
   * 对候选记忆进行去重判断
   */
  async deduplicate(
    candidate: DedupCandidate,
    existingMemories: MemoryFile[]
  ): Promise<DedupResult>;

  /**
   * 批量去重（优化：一次 API 调用处理多个候选）
   */
  async deduplicateBatch(
    candidates: DedupCandidate[],
    existingMemories: MemoryFile[]
  ): Promise<Map<number, DedupResult>>;
}
```

#### 3.2.2 向量相似度计算

**文件**: `src/core/dedup-engine.ts`

```typescript
/**
 * Stage 1: 向量相似度预过滤
 */
private async findSimilarMemories(
  candidate: DedupCandidate,
  existingMemories: MemoryFile[],
  threshold: number
): Promise<Array<{ memory: MemoryFile; similarity: number }>> {
  // 1. 计算候选记忆的 embedding
  const candidateEmbedding = await this.embeddingGenerator.generateEmbedding(
    this.getCandidateText(candidate)
  );

  // 2. 计算与所有现有记忆的相似度
  const similarMemories: Array<{ memory: MemoryFile; similarity: number }> = [];

  for (const memory of existingMemories) {
    // 复用 LanceDB 中已存储的 embedding（避免重复计算）
    const existingEmbedding = await this.getExistingEmbedding(memory);
    const similarity = this.cosineSimilarity(candidateEmbedding, existingEmbedding);

    if (similarity >= threshold) {
      similarMemories.push({ memory, similarity });
    }
  }

  // 3. 按相似度排序
  similarMemories.sort((a, b) => b.similarity - a.similarity);

  return similarMemories;
}

/**
 * 计算余弦相似度
 */
private cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

/**
 * 获取候选记忆的比较文本
 */
private getCandidateText(candidate: DedupCandidate): string {
  return `${candidate.name}: ${candidate.description}\n${candidate.content}`;
}
```

#### 3.2.3 LLM 语义决策

**文件**: `src/core/dedup-engine.ts`

```typescript
/**
 * Stage 2: LLM 语义决策
 */
private async llmDecision(
  candidate: DedupCandidate,
  similarMemory: MemoryFile
): Promise<DedupResult> {
  const prompt = this.buildDedupPrompt(candidate, similarMemory);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': this.options.llmApiKey || process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: this.options.llmModel || 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const decision = this.parseLlmResponse(data.content?.[0]?.text || '');

  return {
    action: decision.action,
    reason: decision.reason,
    similarMemory,
    similarityScore: this.calculateSimilarity(candidate, similarMemory),
    mergedContent: decision.mergedContent,
  };
}

/**
 * 构建去重决策提示词
 */
private buildDedupPrompt(candidate: DedupCandidate, existing: MemoryFile): string {
  return `You are deciding whether to create a new memory or merge with an existing one.

## Candidate Memory (new)
**Name**: ${candidate.name}
**Type**: ${candidate.type}
**Description**: ${candidate.description}
**Content**:
${candidate.content}

## Existing Memory (already stored)
**Name**: ${existing.name}
**Type**: ${existing.type}
**Description**: ${existing.description}
**Content**:
${existing.content}

## Decision Criteria

### CREATE (new memory)
- Different topics or aspects
- Complementary information that should be separate
- Different memory types (e.g., lesson vs decision)

### MERGE (combine into one)
- Same core topic with additional details
- Information evolution (update to existing knowledge)
- Redundant content that should be unified

### SKIP (do not create)
- Exact duplicate or near-duplicate
- Less detailed version of existing memory
- Outdated information

## Output Format
Return JSON:
{
  "action": "CREATE" | "MERGE" | "SKIP",
  "reason": "brief explanation",
  "mergedContent": "required only if MERGE"
}

## Your Decision:`;
}
```

### 3.3 集成到 capture 流程

**文件**: `src/commands/capture.ts`

**修改的 `capture()` 方法**：

```typescript
export async function capture(options: CaptureOptions = {}): Promise<void> {
  // ... 现有逻辑：读取 session 文本、脱敏 ...

  // 1. 提取候选记忆
  const extracted = await extract(sanitized, process.env.ANTHROPIC_API_KEY);

  // 2. 加载现有记忆
  const existingMemories = loadAll(repoRoot);

  // 3. 初始化去重引擎
  const embedConfig = EmbeddingGenerator.fromMemoConfig(config);
  const embeddingGenerator = new EmbeddingGenerator(embedConfig);
  const dedupEngine = new DedupEngine(embeddingGenerator, {
    similarityThreshold: config.dedup?.vectorSimilarityThreshold,
    useLlm: config.dedup?.useLlmDecision,
    llmApiKey: process.env.ANTHROPIC_API_KEY,
  });

  // 4. 对每个候选记忆进行去重判断
  const memoriesToWrite: MemoryFile[] = [];
  const skipLog: Array<{ name: string; reason: string }> = [];
  const mergeLog: Array<{ name: string; mergedInto: string }> = [];

  for (const item of extracted) {
    const candidate: DedupCandidate = {
      name: item.name,
      type: item.type,
      description: item.description,
      content: item.content,
    };

    const result = await dedupEngine.deduplicate(candidate, existingMemories);

    if (result.action === 'CREATE') {
      memoriesToWrite.push({
        name: item.name,
        type: item.type,
        description: item.description,
        tags: item.tags,
        confidence: item.confidence,
        content: item.content,
        created: new Date().toISOString(),
      });
    } else if (result.action === 'MERGE') {
      // 合并到现有记忆
      await this.mergeMemory(repoRoot, result.similarMemory!, result.mergedContent!);
      mergeLog.push({ name: item.name, mergedInto: result.similarMemory!.name });
    } else if (result.action === 'SKIP') {
      skipLog.push({ name: item.name, reason: result.reason });
    }
  }

  // 5. 写入新建记忆
  for (const memory of memoriesToWrite) {
    const filePath = writeMemory(repoRoot, memory);
    console.log(`Created: ${filePath}`);
  }

  // 6. 打印摘要
  console.log(`\n📝 Captured ${memoriesToWrite.length} new memories`);
  if (mergeLog.length > 0) {
    console.log(`🔀 Merged ${mergeLog.length} memories:`);
    for (const log of mergeLog) {
      console.log(`   ${log.name} → ${log.mergedInto}`);
    }
  }
  if (skipLog.length > 0) {
    console.log(`⊘ Skipped ${skipLog.length} duplicates:`);
    for (const log of skipLog) {
      console.log(`   ${log.name}: ${log.reason}`);
    }
  }
}
```

### 3.4 记忆合并逻辑

**文件**: `src/commands/capture.ts`（新建辅助函数）

```typescript
/**
 * 合并记忆内容
 */
async function mergeMemory(
  repoRoot: string,
  existingMemory: MemoryFile,
  newContent: string
): Promise<void> {
  // 读取现有记忆文件
  const content = fs.readFileSync(existingMemory.path, 'utf-8');
  const parsed = matter(content);

  // 合并策略：保留现有 frontmatter，追加新内容到 body
  const mergedFrontmatter = {
    ...parsed.data,
    updated: new Date().toISOString(),
    merge_count: (parsed.data.merge_count || 0) + 1,
  };

  const mergedBody = `${parsed.content}\n\n---\n\n## Merged Content (Added ${new Date().toISOString().split('T')[0]})\n\n${newContent}`;

  const mergedContent = matter.stringify(mergedBody, mergedFrontmatter);

  // 写回文件
  fs.writeFileSync(existingMemory.path, mergedContent, 'utf-8');

  // 更新 LanceDB 索引（如果启用）
  if (config.embedding.engine === 'lancedb') {
    console.log('Run: memo index --incremental to update LanceDB');
  }
}
```

---

## 4. 降级策略

### 4.1 API Key 未配置

```typescript
if (!this.options.llmApiKey && !process.env.ANTHROPIC_API_KEY) {
  console.warn('LLM API key not configured. Using vector-only dedup.');
  // 降级：仅基于向量相似度判断
  if (similarMemories.length > 0) {
    return {
      action: 'SKIP',
      reason: `High similarity (${similarMemories[0].similarity.toFixed(2)}) to existing memory`,
      similarMemory: similarMemories[0].memory,
    };
  }
  return { action: 'CREATE', reason: 'No similar memories found' };
}
```

### 4.2 LLM 调用失败

```typescript
try {
  return await this.llmDecision(candidate, similarMemories[0].memory);
} catch (error) {
  console.warn(`LLM dedup failed: ${(error as Error).message}. Using fallback.`);
  // 降级：基于相似度阈值自动决策
  const similarity = similarMemories[0].similarity;
  if (similarity >= 0.95) {
    return { action: 'SKIP', reason: 'Near-duplicate (similarity ≥ 0.95)' };
  } else if (similarity >= 0.85) {
    return { action: 'MERGE', reason: 'Similar content (similarity ≥ 0.85)' };
  }
  return { action: 'CREATE', reason: 'Distinct content' };
}
```

---

## 5. 测试计划

### 5.1 单元测试

**文件**: `tests/dedup-engine.test.ts`（新建）

```typescript
describe('DedupEngine', () => {
  it('should CREATE when no similar memories exist', async () => {
    // 测试新建场景
  });

  it('should MERGE when high similarity and complementary', async () => {
    // 测试合并场景
  });

  it('should SKIP when near-duplicate', async () => {
    // 测试跳过场景
  });

  it('should handle LLM API failure gracefully', async () => {
    // 测试降级策略
  });

  it('should calculate cosine similarity correctly', async () => {
    // 测试相似度计算
  });
});
```

### 5.2 集成测试

**测试场景**：

1. 连续 3 次 capture 相似内容，验证去重效果
2. 测试 MERGE 后内容正确追加
3. 测试 LLM 不可用时的降级行为

---

## 6. 配置示例

**文件**: `meta/config.yaml`

```yaml
# 完整去重配置
dedup:
  enabled: true
  vectorSimilarityThreshold: 0.85
  useLlmDecision: true
  llmModel: claude-3-5-sonnet-20241022

# 简化配置（使用默认值）
dedup:
  enabled: true
```

---

## 7. 实施计划

### Phase 1：核心实现（3-4 天）

| 任务                            | 预计时间 |
| ------------------------------- | -------- |
| 创建 `src/core/dedup-engine.ts` | 2 天     |
| 实现向量相似度计算              | 0.5 天   |
| 实现 LLM 语义决策               | 1 天     |
| 修改 `capture.ts` 集成去重      | 0.5 天   |

### Phase 2：测试与优化（2-3 天）

| 任务                 | 预计时间 |
| -------------------- | -------- |
| 编写单元测试         | 1 天     |
| 集成测试（多场景）   | 1 天     |
| 性能优化（批量处理） | 0.5 天   |
| 文档更新             | 0.5 天   |

---

## 8. 验收标准

### 功能验收

- [ ] 语义重复的记忆被正确识别（相似度 ≥ 0.85）
- [ ] CREATE/MERGE/SKIP 决策合理
- [ ] MERGE 后内容正确追加到现有记忆
- [ ] LLM 不可用时自动降级

### 性能验收

- [ ] 单次 capture 去重延迟 < 2s（100 条记忆）
- [ ] 批量去重（10 条候选）延迟 < 10s

### 用户体验验收

- [ ] 输出清晰的去重日志（创建/合并/跳过数量）
- [ ] 用户可配置是否启用 LLM 决策
- [ ] 配置项有合理默认值

---

## 9. 总结

**核心价值**：

- ✅ 避免记忆冗余，提升质量
- ✅ 支持信息演化（合并更新）
- ✅ 两阶段设计平衡准确率与性能
- ✅ 降级策略完善，无 API 也能用

**预期收益**：

- 记忆冗余减少 ≥ 50%
- 用户手动清理记忆的时间减少
- 记忆库长期可维护性提升
