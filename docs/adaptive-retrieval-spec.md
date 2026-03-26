# 🎯 自适应检索机制

## 技术规格说明书 (Specification)

**版本**: v1.0-draft  
**日期**: 2026-03-26  
**范围**: 在 `memo recall` 中实现智能检索触发判断

---

## 1. 概述

### 1.1 目标

实现**自适应检索触发机制**，根据查询内容自动判断是否需要检索，避免无意义的 token 消耗。

### 1.2 当前问题

**当前行为**：每次 `memo recall` 都执行完整检索流程

```typescript
// src/commands/recall.ts
export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  // 直接执行检索，无前置判断
  const { results, markdown } = await recall(query, repoRoot, config, engine, scope, explain);
  // ...
}
```

**缺陷**：

- 问候语（"hi"、"hello"）也触发检索，浪费 token
- 简单确认（"ok"、"yes"）也检索，无实际价值
- 每次检索平均消耗 ~100 tokens，累积成本高

### 1.3 预期效果

| 查询类型   | 示例                       | 当前行为 | 改进后行为  |
| ---------- | -------------------------- | -------- | ----------- |
| 问候语     | "hi", "hello"              | ❌ 检索  | ✅ 跳过     |
| 简单确认   | "ok", "yes", "thanks"      | ❌ 检索  | ✅ 跳过     |
| 无意义输入 | "test", "debug", "..."     | ❌ 检索  | ✅ 跳过     |
| CJK 短查询 | "好"、"测试"（<6 字符）    | ❌ 检索  | ✅ 跳过     |
| 强制检索词 | "remember", "之前", "上次" | ✅ 检索  | ✅ 强制检索 |
| 正常查询   | "pnpm 安装失败"            | ✅ 检索  | ✅ 检索     |

---

## 2. 技术方案

### 2.1 判断流程

```
┌─────────────────────────────────────────────────────────┐
│                    recallCommand()                      │
│                   用户输入 query                        │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────┐
         │    shouldSkipRetrieval(query)   │
         │    自适应检索判断               │
         └──────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │  SKIP   │       │  FORCE  │       │ NORMAL  │
    │ 跳过检索 │       │ 强制检索│       │ 正常检索│
    │         │       │         │       │         │
    │ 返回提示 │       │ 忽略阈值│       │ 标准流程│
    └─────────┘       └─────────┘       └─────────┘
```

### 2.2 判断规则

**跳过检索（Skip）**：

```
IF query 匹配 SKIP_PATTERNS → SKIP
ELSE IF query 长度 < MIN_LENGTH (英文 15 / CJK 6) → SKIP
ELSE IF query 是 ping/pong/test → SKIP
```

**强制检索（Force）**：

```
IF query 包含 FORCE_KEYWORDS → FORCE
```

**正常检索（Normal）**：

```
ELSE → NORMAL（执行标准检索流程）
```

---

## 3. 详细设计

### 3.1 核心模块

**文件**: `src/core/adaptive-retrieval.ts`（新建）

```typescript
/**
 * 自适应检索判断模块
 * 根据查询内容自动判断是否需要检索
 */

/**
 * 跳过检索的模式（正则）
 */
const SKIP_PATTERNS: RegExp[] = [
  // 问候语
  /^(hi|hello|hey|goodbye|see you|thanks|thank you|bye)/i,
  // 简单确认
  /^(ok|okay|sure|yes|no|yeah|yep|nope|cool|great|awesome)/i,
  // 无意义输入
  /^(test|debug|ping|pong|check|hello world|123|abc)/i,
  // 元问题（关于 AI 的问题）
  /^(are you|can you|do you|will you|who are you)/i,
  // 文件操作（无上下文）
  /^(opened|closed|saved|created|deleted|read|write)/i,
  // 简单命令
  /^(run|execute|build|lint|test|install|remove|delete)/i,
  // 表情符号为主
  /^[😀-🙏]+$/u,
];

/**
 * 强制检索的模式（正则）
 */
const FORCE_PATTERNS: RegExp[] = [
  // 记忆相关关键词
  /(remember|recall|memory|memobank|memo|previously|last time|before)/i,
  // 中文记忆关键词
  /(记得|记忆|之前|上次|以前|有没有说过)/,
  // 决策追溯
  /(why did|why we|decision|decided|choose|choice)/i,
  // 经验查询
  /(how did|how we|learned|discovered|found out)/i,
];

/**
 * CJK 字符判断
 */
const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/;

/**
 * 查询长度阈值
 */
const MIN_LENGTH = {
  ENGLISH: 15,
  CJK: 6, // 中日韩文字字符数少但信息密度高
};

export interface RetrievalDecision {
  shouldRetrieve: boolean;
  force?: boolean;
  reason: string;
}

/**
 * 判断是否需要检索
 */
export function shouldRetrieve(query: string): RetrievalDecision {
  const trimmedQuery = query.trim();

  // 1. 检查强制检索模式
  for (const pattern of FORCE_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      return {
        shouldRetrieve: true,
        force: true,
        reason: 'Force retrieval: contains memory-related keywords',
      };
    }
  }

  // 2. 检查跳过模式
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      return {
        shouldRetrieve: false,
        reason: 'Skipped: matches low-value pattern',
      };
    }
  }

  // 3. 检查查询长度（CJK 感知）
  const cjkCharCount = countCjkChars(trimmedQuery);
  const englishCharCount = trimmedQuery.length - cjkCharCount;

  const isCjkQuery = cjkCharCount > 0;
  const minLength = isCjkQuery ? MIN_LENGTH.CJK : MIN_LENGTH.ENGLISH;

  // 计算有效长度（CJK 字符权重更高）
  const effectiveLength = cjkCharCount * 2 + englishCharCount;

  if (effectiveLength < minLength) {
    return {
      shouldRetrieve: false,
      reason: `Skipped: query too short (effective length: ${effectiveLength}, min: ${minLength})`,
    };
  }

  // 4. 正常检索
  return {
    shouldRetrieve: true,
    force: false,
    reason: 'Normal retrieval: query passed all filters',
  };
}

/**
 * 统计 CJK 字符数
 */
function countCjkChars(text: string): number {
  let count = 0;
  for (const char of text) {
    if (CJK_PATTERN.test(char)) {
      count++;
    }
  }
  return count;
}

/**
 * 获取判断摘要（用于日志输出）
 */
export function getDecisionSummary(decision: RetrievalDecision): string {
  if (decision.force) {
    return `🔍 Force retrieval: ${decision.reason}`;
  }
  if (decision.shouldRetrieve) {
    return `🔍 Normal retrieval: ${decision.reason}`;
  }
  return `⊘ Skipped: ${decision.reason}`;
}
```

### 3.2 集成到 recall 命令

**文件**: `src/commands/recall.ts`

**修改的 `recallCommand()` 方法**：

```typescript
import { shouldRetrieve, getDecisionSummary } from '../core/adaptive-retrieval';

export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const config = loadConfig(repoRoot);

  // ========== 新增：自适应检索判断 ==========
  const decision = shouldRetrieve(query);

  // 输出判断结果（非静默模式）
  const isSilent = process.env.SILENT === '1';
  if (!isSilent) {
    console.log(getDecisionSummary(decision));
  }

  // 跳过检索
  if (!decision.shouldRetrieve) {
    if (!isSilent) {
      console.log('\n*No memory retrieval performed. Run with --force to override.*\n');
    }
    return;
  }

  // 强制检索：忽略长度阈值（已在前置判断中处理）
  // 正常检索：继续执行标准流程

  if (options.top) {
    config.memory.top_k = options.top;
  }

  const scope = (options.scope as MemoryScope) || 'all';
  const explain = options.explain || false;

  // 执行检索（现有逻辑）
  let engine;
  if (options.engine === 'lancedb') {
    // ... 现有引擎初始化逻辑 ...
  }

  const { results, markdown } = await recall(query, repoRoot, config, engine, scope, explain);

  // 输出结果（现有逻辑）
  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(markdown);

  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, config.embedding.engine);
  }
}
```

### 3.3 命令行选项增强

**文件**: `src/commands/recall.ts`

**新增选项**：

```typescript
export interface RecallOptions {
  top?: number;
  engine?: string;
  format?: string;
  dryRun?: boolean;
  repo?: string;
  scope?: string;
  explain?: boolean;
  force?: boolean; // 新增：强制检索（跳过自适应判断）
  explainSkip?: boolean; // 新增：解释跳过原因
}
```

**实现**：

```typescript
// 在 shouldRetrieve 判断前添加
if (options.force) {
  console.log('⚡ Force retrieval enabled (--force)');
  // 跳过自适应判断，直接执行检索
} else {
  const decision = shouldRetrieve(query);
  // ... 正常判断逻辑
}
```

### 3.4 平台集成钩子

**文件**: `src/commands/install.ts`（修改）

**Claude Code 钩子增强**：

```typescript
// 在生成的钩子脚本中添加自适应判断
const HOOK_SCRIPT = `
#!/usr/bin/env bash
# memo recall hook with adaptive retrieval

query="$*"

# Skip for very short queries
if [ \${#query} -lt 6 ]; then
  exit 0
fi

# Skip for common greetings
if echo "$query" | grep -qiE '^(hi|hello|hey|thanks|ok|yes|no)'; then
  exit 0
fi

# Force for memory-related keywords
if echo "$query" | grep -qiE '(remember|previously|last time|memory)'; then
  memo recall "$query" --force
  exit 0
fi

# Normal retrieval
memo recall "$query"
`;
```

---

## 4. 配置扩展

**文件**: `src/config.ts`

**新增配置项**：

```yaml
# meta/config.yaml
retrieval:
  adaptive:
    enabled: true
    skipPatterns: # 自定义跳过模式（追加到默认）
      - '^npm run'
      - '^yarn '
    forceKeywords: # 自定义强制关键词（追加到默认）
      - 'context'
      - 'background'
    minLength:
      english: 15
      cjk: 6
```

---

## 5. 测试计划

### 5.1 单元测试

**文件**: `tests/adaptive-retrieval.test.ts`（新建）

```typescript
describe('shouldRetrieve', () => {
  // 跳过场景
  it('should skip greetings', () => {
    expect(shouldRetrieve('hi')).toEqual({ shouldRetrieve: false, ... });
    expect(shouldRetrieve('hello')).toEqual({ shouldRetrieve: false, ... });
  });

  it('should skip simple confirmations', () => {
    expect(shouldRetrieve('ok')).toEqual({ shouldRetrieve: false, ... });
    expect(shouldRetrieve('yes')).toEqual({ shouldRetrieve: false, ... });
  });

  it('should skip short queries', () => {
    expect(shouldRetrieve('test')).toEqual({ shouldRetrieve: false, ... });
    expect(shouldRetrieve('abc')).toEqual({ shouldRetrieve: false, ... });
  });

  it('should skip CJK queries shorter than 6 chars', () => {
    expect(shouldRetrieve('测试')).toEqual({ shouldRetrieve: false, ... });
    expect(shouldRetrieve('你好')).toEqual({ shouldRetrieve: false, ... });
  });

  // 强制检索场景
  it('should force retrieval for memory keywords', () => {
    expect(shouldRetrieve('remember this')).toEqual({ shouldRetrieve: true, force: true, ... });
    expect(shouldRetrieve('之前说过')).toEqual({ shouldRetrieve: true, force: true, ... });
  });

  // 正常检索场景
  it('should retrieve normal queries', () => {
    expect(shouldRetrieve('pnpm installation failed')).toEqual({ shouldRetrieve: true, force: false, ... });
    expect(shouldRetrieve('如何解决 typescript 类型错误')).toEqual({ shouldRetrieve: true, force: false, ... });
  });
});
```

### 5.2 集成测试

**测试场景**：

1. 连续输入 10 个不同类型的查询，验证判断准确性
2. 测试 `--force` 选项覆盖判断
3. 测试自定义配置生效

---

## 6. 性能评估

### 6.1 Token 节省估算

**假设场景**：用户每天执行 20 次 `memo recall`

| 查询类型  | 占比        | 当前 Token 消耗    | 改进后 Token 消耗  |
| --------- | ----------- | ------------------ | ------------------ |
| 问候/确认 | 30% (6 次)  | 6 × 100 = 600      | 0                  |
| 短查询    | 20% (4 次)  | 4 × 100 = 400      | 0                  |
| 正常查询  | 50% (10 次) | 10 × 100 = 1000    | 10 × 100 = 1000    |
| **总计**  | 100%        | **2000 tokens/天** | **1000 tokens/天** |

**节省**：50% token 消耗

### 6.2 延迟优化

| 场景     | 当前延迟           | 改进后延迟          |
| -------- | ------------------ | ------------------- |
| 跳过检索 | ~500ms（完整流程） | <10ms（判断即返回） |
| 正常检索 | ~500ms             | ~500ms（无变化）    |

---

## 7. 实施计划

### Phase 1：核心实现（1-2 天）

| 任务                                  | 预计时间 |
| ------------------------------------- | -------- |
| 创建 `src/core/adaptive-retrieval.ts` | 0.5 天   |
| 实现跳过/强制判断逻辑                 | 0.5 天   |
| 修改 `recall.ts` 集成判断             | 0.5 天   |
| 添加 `--force` 选项                   | 0.25 天  |
| 编写单元测试                          | 0.25 天  |

### Phase 2：优化与文档（1 天）

| 任务         | 预计时间 |
| ------------ | -------- |
| 平台钩子集成 | 0.5 天   |
| 配置扩展支持 | 0.25 天  |
| 文档更新     | 0.25 天  |

---

## 8. 验收标准

### 功能验收

- [ ] 问候语/简单确认被正确跳过
- [ ] CJK 短查询（<6 字符）被正确跳过
- [ ] 强制检索词触发检索
- [ ] `--force` 选项覆盖判断
- [ ] 自定义配置生效

### 性能验收

- [ ] 跳过判断延迟 < 10ms
- [ ] Token 消耗减少 ≥ 40%

### 用户体验验收

- [ ] 输出清晰的跳过/检索日志
- [ ] 正常查询不受影响
- [ ] 用户可自定义模式

---

## 9. 总结

**核心价值**：

- ✅ 减少无意义的 token 消耗（预计 50%）
- ✅ 提升检索响应速度（跳过场景 <10ms）
- ✅ CJK 感知，适配多语言用户
- ✅ 强制检索保证重要查询不被误判

**预期收益**：

- 日均 token 消耗减少 50%
- 用户等待时间减少（跳过场景即时响应）
- 检索质量提升（过滤噪声查询）
