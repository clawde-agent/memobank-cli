# 📈 访问频率跟踪增强

## 技术规格说明书 (Specification)

**版本**: v1.0-draft  
**日期**: 2026-03-26  
**范围**: 在检索排序中引入访问频率因子

---

## 1. 概述

### 1.1 目标

增强现有的访问跟踪机制（`lifecycle-manager.ts`），将**访问频率**纳入检索排序，让频繁被 recall 的记忆获得更高排名。

### 1.2 当前问题

**当前实现**（`src/core/retriever.ts` 第 29-34 行）：

```typescript
// Apply access frequency boost
results = results.map((result) => {
  const log = accessLogs[result.memory.path];
  const accessCount = log?.accessCount ?? 0;
  const boost = Math.min(1.5, 1.0 + Math.log1p(accessCount) / 10);
  return { ...result, score: Math.min(1.0, result.score * boost) };
});
```

**缺陷**：

- 简单的对数加权 (`log1p`) 不够精细
- 未考虑**时间衰减**（最近访问 vs 历史访问）
- 未考虑**epoch 感知**（团队手气变化）
- 与 `lifecycle-manager.ts` 的 `epochAccessCount` 未联动

### 1.3 预期效果

| 场景                                      | 当前行为             | 改进后行为                |
| ----------------------------------------- | -------------------- | ------------------------- |
| 记忆 A：历史访问 10 次，最近 90 天未访问  | 高排名（累计次数高） | 中等排名（时间衰减）      |
| 记忆 B：历史访问 3 次，最近 7 天访问 2 次 | 中等排名             | 高排名（近期活跃）        |
| 记忆 C：新创建，未访问                    | 低排名               | 低排名（保持）            |
| 记忆 D：team epoch 后访问 5 次            | 无特殊处理           | 高排名（当前 epoch 活跃） |

---

## 2. 技术方案

### 2.1 核心公式

**改进后的分数计算**：

```
finalScore = retrievalScore × frequencyBoost × recencyWeight
```

**频率增强因子**：

```
frequencyBoost = 1.0 + α × log2(1 + accessCount) + β × epochAccessCount
```

**时间衰减权重**：

```
recencyWeight = exp(-λ × daysSinceLastAccess)
```

**参数说明**：
| 参数 | 默认值 | 含义 |
|------|--------|------|
| `α` | 0.1 | 历史访问权重 |
| `β` | 0.2 | epoch 访问权重（当前团队周期） |
| `λ` | 0.01 | 时间衰减率（半衰期约 70 天） |

### 2.2 设计原则

1. **历史访问有贡献，但边际递减**：`log2(1 + accessCount)` 确保次数越多增长越慢
2. **近期访问权重更高**：`recencyWeight` 让最近被 recall 的记忆排名提升
3. **epoch 感知**：`epochAccessCount` 反映当前团队周期的活跃度
4. **有上限**：总 boost 不超过 2.0（防止过度主导）

---

## 3. 详细设计

### 3.1 配置扩展

**文件**: `src/config.ts`

**新增配置项**：

```yaml
# meta/config.yaml
retrieval:
  frequencyBoost:
    enabled: true
    historicalWeight: 0.1 # α: 历史访问权重
    epochWeight: 0.2 # β: epoch 访问权重
    decayRate: 0.01 # λ: 时间衰减率
    maxBoost: 2.0 # 最大 boost 倍数
```

**默认配置**：

```typescript
const DEFAULT_CONFIG: MemoConfig = {
  // ... 现有配置
  retrieval: {
    frequencyBoost: {
      enabled: true,
      historicalWeight: 0.1,
      epochWeight: 0.2,
      decayRate: 0.01,
      maxBoost: 2.0,
    },
  },
};
```

### 3.2 核心模块修改

#### 3.2.1 增强 AccessLog 结构

**文件**: `src/core/lifecycle-manager.ts`

**当前结构**（已有）：

```typescript
export interface AccessLog {
  memoryPath: string;
  lastAccessed: Date;
  accessCount: number;
  recallQueries: string[];
  epochAccessCount: number;
  team_epoch: string;
}
```

**无需修改**：现有结构已包含所需字段。

#### 3.2.2 实现频率增强计算

**文件**: `src/core/frequency-boost.ts`（新建）

```typescript
/**
 * 访问频率增强模块
 * 计算基于访问历史的检索分数 boost
 */

import type { AccessLog } from './lifecycle-manager';
import type { MemoConfig } from '../config';

export interface FrequencyBoostConfig {
  enabled: boolean;
  historicalWeight: number; // α
  epochWeight: number; // β
  decayRate: number; // λ
  maxBoost: number;
}

const DEFAULT_CONFIG: FrequencyBoostConfig = {
  enabled: true,
  historicalWeight: 0.1,
  epochWeight: 0.2,
  decayRate: 0.01,
  maxBoost: 2.0,
};

/**
 * 计算频率增强因子
 */
export function calculateFrequencyBoost(
  accessLog: AccessLog | undefined,
  config: FrequencyBoostConfig = DEFAULT_CONFIG
): number {
  if (!accessLog || !config.enabled) {
    return 1.0;
  }

  const now = Date.now();
  const lastAccessTime = new Date(accessLog.lastAccessed).getTime();
  const daysSinceLastAccess = (now - lastAccessTime) / (1000 * 60 * 60 * 24);

  // 1. 历史访问贡献（对数增长，边际递减）
  const historicalContribution = config.historicalWeight * Math.log2(1 + accessLog.accessCount);

  // 2. epoch 访问贡献（线性增长，反映当前周期活跃度）
  const epochContribution = config.epochWeight * (accessLog.epochAccessCount ?? 0);

  // 3. 时间衰减（指数衰减，最近访问权重高）
  const recencyWeight = Math.exp(-config.decayRate * daysSinceLastAccess);

  // 4. 计算总 boost
  const baseBoost = 1.0 + historicalContribution + epochContribution;
  const finalBoost = baseBoost * recencyWeight;

  // 5. 限制最大值
  return Math.min(finalBoost, config.maxBoost);
}

/**
 * 计算时间衰减权重（单独导出，供其他模块使用）
 */
export function calculateRecencyWeight(
  lastAccessDate: Date,
  decayRate: number = 0.01,
  now: Date = new Date()
): number {
  const daysSinceAccess = (now.getTime() - lastAccessDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-decayRate * daysSinceAccess);
}

/**
 * 获取 boost 分解（用于调试/explain 模式）
 */
export function getBoostBreakdown(
  accessLog: AccessLog | undefined,
  config: FrequencyBoostConfig = DEFAULT_CONFIG
): {
  historical: number;
  epoch: number;
  recency: number;
  total: number;
} {
  if (!accessLog) {
    return { historical: 0, epoch: 0, recency: 1.0, total: 1.0 };
  }

  const now = Date.now();
  const lastAccessTime = new Date(accessLog.lastAccessed).getTime();
  const daysSinceLastAccess = (now - lastAccessTime) / (1000 * 60 * 60 * 24);

  const historical = config.historicalWeight * Math.log2(1 + accessLog.accessCount);
  const epoch = config.epochWeight * (accessLog.epochAccessCount ?? 0);
  const recency = Math.exp(-config.decayRate * daysSinceLastAccess);
  const total = Math.min((1.0 + historical + epoch) * recency, config.maxBoost);

  return { historical, epoch, recency, total };
}
```

### 3.3 集成到检索流程

**文件**: `src/core/retriever.ts`

**修改的 `recall()` 方法**：

```typescript
import { calculateFrequencyBoost, getBoostBreakdown } from './frequency-boost';

export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter,
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false
): Promise<{ results: RecallResult[]; markdown: string }> {
  // ... 现有逻辑：加载记忆、执行检索 ...

  const accessLogs = loadAccessLogs(repoRoot);
  let results = await searchEngine.search(query, memories, config.memory.top_k);

  // ========== 修改：应用频率增强 ==========
  const boostConfig = config.retrieval?.frequencyBoost ?? DEFAULT_CONFIG;

  results = results.map((result) => {
    const log = accessLogs[result.memory.path];
    const boost = calculateFrequencyBoost(log, boostConfig);

    // 记录分数分解（用于 explain 模式）
    const scoreBreakdown = explain ? getBoostBreakdown(log, boostConfig) : undefined;

    return {
      ...result,
      score: Math.min(1.0, result.score * boost),
      scoreBreakdown: scoreBreakdown
        ? {
            keyword: 0, // 保留原有字段（text engine 用）
            tags: 0,
            recency: 0,
            frequency: boost, // 新增：频率 boost
          }
        : undefined,
    };
  });

  results.sort((a, b) => b.score - a.score);

  // ... 后续逻辑：记录访问、更新状态、应用 reranker ...
}
```

### 3.4 Explain 模式增强

**文件**: `src/core/retriever.ts`

**修改的 `formatResultsAsMarkdown()` 方法**：

```typescript
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number,
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false
): string {
  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} of ${totalMemories} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory, score } = result;
      const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
      const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
      const relativePath = memory.path.replace(/^.*\/memobank\//, '');

      markdown += `### [score: ${score.toFixed(2)}] ${memory.name}${confidenceStr}\n`;

      if (explain && result.scoreBreakdown) {
        const b = result.scoreBreakdown;
        const parts = [
          `base(${(score / (b.frequency || 1)).toFixed(2)})`,
          `frequency(${b.frequency?.toFixed(2) || '1.00'})`,
        ];
        markdown += `  scoring: ${parts.join(' × ')}\n`;

        // 显示访问统计
        const accessLog = loadAccessLogs('')[result.memory.path];
        if (accessLog) {
          markdown += `  access: ${accessLog.accessCount} total, ${accessLog.epochAccessCount || 0} this epoch\n`;
        }
      }

      markdown += `> ${memory.description}\n`;
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
    markdown += `---\n*To flag a result: memo correct <file> --reason "not relevant"*\n\n`;
  }

  // ... 剩余逻辑 ...
}
```

---

## 4. 与 Lifecycle Manager 的联动

### 4.1 Epoch 重置时同步

**文件**: `src/core/lifecycle-manager.ts`

**当前 `resetEpoch()` 函数**（已有）：

```typescript
export function resetEpoch(repoRoot: string): void {
  const logs = loadAccessLogs(repoRoot);
  const newEpoch = new Date().toISOString();
  for (const key of Object.keys(logs)) {
    logs[key].epochAccessCount = 0;
    logs[key].team_epoch = newEpoch;
  }
  saveAccessLogs(repoRoot, logs);
}
```

**无需修改**：epoch 重置后，`epochAccessCount` 归零，频率增强自动重新计算。

### 4.2 状态升级联动

**文件**: `src/core/lifecycle-manager.ts`

**当前 `updateStatusOnRecall()` 函数**（已有）：

```typescript
export function updateStatusOnRecall(repoRoot: string, memoryPath: string): void {
  const logs = loadAccessLogs(repoRoot);
  const log = logs[memoryPath];
  if (!log) return;

  // Increment epoch count
  log.epochAccessCount = (log.epochAccessCount ?? 0) + 1;
  saveAccessLogs(repoRoot, logs);

  // Apply status upgrades...
}
```

**无需修改**：每次 recall 后 `epochAccessCount` 自增，频率增强自动生效。

---

## 5. 测试计划

### 5.1 单元测试

**文件**: `tests/frequency-boost.test.ts`（新建）

```typescript
describe('calculateFrequencyBoost', () => {
  it('should return 1.0 for undefined access log', () => {
    expect(calculateFrequencyBoost(undefined)).toBe(1.0);
  });

  it('should apply historical boost with diminishing returns', () => {
    const log: AccessLog = {
      memoryPath: 'test.md',
      lastAccessed: new Date(),
      accessCount: 100,
      recallQueries: [],
      epochAccessCount: 0,
      team_epoch: new Date().toISOString(),
    };
    const boost = calculateFrequencyBoost(log);
    expect(boost).toBeGreaterThan(1.0);
    expect(boost).toBeLessThan(2.0); // 有上限
  });

  it('should apply epoch boost linearly', () => {
    const log: AccessLog = {
      memoryPath: 'test.md',
      lastAccessed: new Date(),
      accessCount: 10,
      recallQueries: [],
      epochAccessCount: 5,
      team_epoch: new Date().toISOString(),
    };
    const boost = calculateFrequencyBoost(log);
    // epochAccessCount=5 应贡献 5 × 0.2 = 1.0
    expect(boost).toBeGreaterThan(1.5);
  });

  it('should apply recency decay for old accesses', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 180); // 180 天前
    const log: AccessLog = {
      memoryPath: 'test.md',
      lastAccessed: oldDate,
      accessCount: 50,
      recallQueries: [],
      epochAccessCount: 0,
      team_epoch: oldDate.toISOString(),
    };
    const boost = calculateFrequencyBoost(log);
    // 时间衰减应显著降低 boost
    expect(boost).toBeLessThan(1.5);
  });

  it('should respect maxBoost limit', () => {
    const log: AccessLog = {
      memoryPath: 'test.md',
      lastAccessed: new Date(),
      accessCount: 1000,
      recallQueries: [],
      epochAccessCount: 100,
      team_epoch: new Date().toISOString(),
    };
    const boost = calculateFrequencyBoost(log, { ...DEFAULT_CONFIG, maxBoost: 1.5 });
    expect(boost).toBeLessThanOrEqual(1.5);
  });
});
```

### 5.2 集成测试

**测试场景**：

1. 创建 3 条记忆，模拟不同访问模式
2. 执行检索，验证排名顺序符合预期
3. 修改配置参数，验证生效

---

## 6. 配置示例

**文件**: `meta/config.yaml`

```yaml
# 完整配置
retrieval:
  frequencyBoost:
    enabled: true
    historicalWeight: 0.1
    epochWeight: 0.2
    decayRate: 0.01
    maxBoost: 2.0

# 简化配置（使用默认值）
retrieval:
  frequencyBoost:
    enabled: true
```

---

## 7. 实施计划

### Phase 1：核心实现（1 天）

| 任务                                          | 预计时间 |
| --------------------------------------------- | -------- |
| 创建 `src/core/frequency-boost.ts`            | 0.5 天   |
| 修改 `retriever.ts` 集成增强                  | 0.25 天  |
| 修改 `formatResultsAsMarkdown()` 支持 explain | 0.25 天  |

### Phase 2：测试与文档（1 天）

| 任务         | 预计时间 |
| ------------ | -------- |
| 编写单元测试 | 0.5 天   |
| 集成测试     | 0.25 天  |
| 文档更新     | 0.25 天  |

---

## 8. 验收标准

### 功能验收

- [ ] 历史访问次数贡献符合对数增长（边际递减）
- [ ] epoch 访问次数贡献符合线性增长
- [ ] 时间衰减符合指数衰减
- [ ] 总 boost 不超过配置上限
- [ ] explain 模式显示频率分解

### 性能验收

- [ ] 频率增强计算延迟 < 1ms/条记忆
- [ ] 检索总延迟无明显增加

### 用户体验验收

- [ ] 频繁访问的记忆排名提升
- [ ] 长期未访问的记忆排名下降
- [ ] epoch 重置后排名重新调整

---

## 9. 总结

**核心价值**：

- ✅ 让活跃记忆更容易被召回（正反馈）
- ✅ 时间衰减避免"老记忆永远在前"
- ✅ epoch 感知反映团队当前关注点
- ✅ 参数可配置，适配不同团队需求

**预期收益**：

- 检索相关性提升（活跃记忆更相关）
- 记忆生命周期自然演化（不活跃的记忆自然下沉）
- 团队协作更顺畅（epoch 感知反映集体关注点）
