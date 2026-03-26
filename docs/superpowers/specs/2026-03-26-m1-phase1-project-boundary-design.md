# M1 Phase 1 + Project Boundary — 异步队列基础设施设计

**Created**: 2026-03-26
**Status**: Draft
**Scope**: M1 Phase 1（pending 队列）+ Project Context Boundary（写入时打标，publish 前校验）

---

## 1. 问题陈述

当前 `memo capture` 同步提取记忆并直接写入 `.md` 文件：

```
capture → sanitize → LLM extract → writeMemory(.md)
```

两个问题：

1. **无队列**：无法支持 Phase 2/3 的批量处理和多触发器（cron、CI/CD、session end）
2. **无项目归属**：记忆写入时不携带 `projectId`，`workspace publish` 无法判断记忆来源于哪个项目

---

## 2. 设计目标

1. 引入 `.pending/` 队列作为 capture → memory 的中间层
2. 每条 pending 记录携带 `projectId`，写入 `.md` 时同步写入 frontmatter
3. `workspace publish` 前校验记忆的 `project` frontmatter 与当前 repo 的 projectId 匹配
4. 用户体验不变（Phase 1 对用户完全透明，行为与现在一致）
5. 改动范围最小：~90 行新代码，~15 行改动

> **Phase 1 overhead 说明**：每次 capture 新增 2 次文件 I/O（write pending + delete pending），
> 换取 Phase 2/3 零重构成本——触发器只需改"何时调用 processQueue"，数据流不变。

---

## 3. 整体数据流

```
memo capture --session=<text>
      │
      ├─ 1. sanitize(sessionText)
      ├─ 2. extract() → candidates[]        ← LLM，结构化提取（不变）
      ├─ 3. resolveProjectId(memoBankDir)    ← git remote → config.name → dir name
      ├─ 4. writePending(memoBankDir, entry) ← 写入 .pending/<id>.json
      │
      └─ 5. processQueue(memoBankDir)        ← 立即同步执行（Phase 2/3 改成异步触发）
                │
                ├─ 读取所有 .pending/*.json
                ├─ 校验 projectId 匹配 → 不匹配：删除 + 警告
                ├─ 对每条 candidate：name 已存在? → 跳过 / writeMemory（含 project 字段）
                └─ 删除已处理的 .pending 文件
```

**Phase 2/3 唯一需要改的地方**：第 5 步从"立即同步"改为"由触发器调用"。

---

## 4. 命名约定

`memoBankDir` 指 `findRepoRoot()` 返回的路径，即 `.memobank/` 目录本身
（例：`/repo/.memobank`）。

所有新增函数参数统一使用 `memoBankDir`，不使用 `repoRoot`，
避免与"git repo 根目录"混淆。`resolveProjectId` 内部用 `path.dirname(memoBankDir)`
才能得到 git working directory。

---

## 5. Pending JSON Schema

```json
{
  "id": "LRN-20260326-143000-a1b2",
  "timestamp": "2026-03-26T14:30:00Z",
  "projectId": "clawde-agent/memobank-cli",
  "candidates": [
    {
      "name": "use-pnpm-over-npm",
      "type": "decision",
      "description": "团队统一使用 pnpm 替代 npm",
      "tags": ["package-manager", "tooling"],
      "confidence": "high",
      "content": "## Decision\n..."
    }
  ]
}
```

**字段说明：**

| 字段           | 来源                         | 用途                                |
| -------------- | ---------------------------- | ----------------------------------- |
| `id`           | 生成时（timestamp + random） | 唯一标识，文件名同 id               |
| `timestamp`    | `new Date().toISOString()`   | 审计用                              |
| `projectId`    | `resolveProjectId()`         | process-queue 边界校验依据          |
| `candidates[]` | `extract()` 输出             | 已结构化候选，processQueue 直接消费 |

文件存在即代表 pending 状态，删除即代表已处理。不需要 `status` 字段。

`.pending/` 目录加入 `.gitignore`。

---

## 6. types.ts 变更

`MemoryFile` 新增可选字段 `project`：

```typescript
export interface MemoryFile {
  path: string;
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  created: string;
  updated?: string;
  review_after?: string;
  confidence?: Confidence;
  status?: Status;
  content: string;
  scope?: MemoryScope;
  project?: string; // ← 新增：来源项目 ID（写入 frontmatter）
}
```

`store.ts` 的 `writeMemory` 和 `loadFile` 需同步处理 `project` 字段（读写 frontmatter）。

---

## 7. projectId 解析

加入 `src/core/store.ts`（与现有路径逻辑同层，不新建文件）：

```typescript
export function resolveProjectId(memoBankDir: string): string {
  const gitCwd = path.dirname(memoBankDir); // .memobank 的上级 = git working dir

  // 1. git remote origin
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: gitCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    const match = remote.match(/[:/]([^/:]+\/[^/.]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {}

  // 2. config.project.name
  try {
    const config = loadConfig(memoBankDir);
    if (config.project?.name) return config.project.name;
  } catch {}

  // 3. 目录名（.memobank 的上级）
  return path.basename(gitCwd);
}
```

---

## 8. queue-processor.ts

新建 `src/core/queue-processor.ts`（~55 行）：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { loadAll, writeMemory, resolveProjectId } from './store';
import type { MemoryType, Confidence } from '../types';

interface PendingCandidate {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}

interface PendingEntry {
  id: string;
  timestamp: string;
  projectId: string;
  candidates: PendingCandidate[];
}

export async function processQueue(memoBankDir: string): Promise<void> {
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) return;

  const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const currentProjectId = resolveProjectId(memoBankDir);
  const existing = loadAll(memoBankDir);

  for (const file of files) {
    const filePath = path.join(pendingDir, file);

    let entry: PendingEntry;
    try {
      entry = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PendingEntry;
    } catch {
      console.warn(`Skipping corrupt pending file: ${file}`);
      fs.unlinkSync(filePath);
      continue;
    }

    if (entry.projectId !== currentProjectId) {
      // 删除跨项目条目（用户已确认此策略）
      // 注意：若 git remote 临时不可用导致 resolveProjectId 降级，
      // 可能误删有效条目。已知风险，可接受（Phase 2 可引入 quarantine 目录）。
      console.warn(`Deleted cross-project entry: ${entry.projectId} !== ${currentProjectId}`);
      fs.unlinkSync(filePath);
      continue;
    }

    for (const candidate of entry.candidates) {
      // 简单 name 精确匹配去重（Phase 1；Phase 2 引入语义去重）
      if (existing.some((m) => m.name === candidate.name)) continue;
      writeMemory(memoBankDir, {
        ...candidate,
        created: new Date().toISOString(),
        project: entry.projectId,
      });
    }

    fs.unlinkSync(filePath);
  }
}
```

---

## 9. capture.ts 改动

```typescript
// 原来（直接写入）：
for (const item of highValueMemories) {
  if (isDuplicate(item.name, existingMemories)) { ... }
  writeMemory(repoRoot, memory);
}

// 改为（写入 pending，立即处理）：
const memoBankDir = repoRoot; // 已经是 .memobank/ 目录
const entry: PendingEntry = {
  id: `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  timestamp: new Date().toISOString(),
  projectId: resolveProjectId(memoBankDir),
  candidates: highValueMemories,
};
writePending(memoBankDir, entry);
await processQueue(memoBankDir);
```

`isDuplicate` 函数和去重逻辑从 capture 移入 `processQueue`，capture 本身不再做去重。

---

## 10. store.ts 新增

```typescript
export function writePending(memoBankDir: string, entry: PendingEntry): void {
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });
  fs.writeFileSync(
    path.join(pendingDir, `${entry.id}.json`),
    JSON.stringify(entry, null, 2),
    'utf-8'
  );
}
```

同时更新 `writeMemory` 和 `loadFile` 处理 `project` 字段（frontmatter 读写）。

---

## 11. workspace publish 校验

在 `workspacePublish`（`src/commands/workspace.ts`）的 secret scan 之后、`fs.copyFileSync` 之前，
插入 per-file project 校验：

```typescript
// 在 secret scan 之后插入
import matter from 'gray-matter';
import { resolveProjectId } from '../core/store';

const fileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
const { data: frontmatter } = matter(fileContent);
const currentProjectId = resolveProjectId(repoRoot);

if (frontmatter.project && frontmatter.project !== currentProjectId) {
  throw new Error(
    `Project boundary violation: memory belongs to "${frontmatter.project}", ` +
      `current project is "${currentProjectId}". Aborting publish.`
  );
}
```

`repoRoot` 在 `workspacePublish` 中已有，无需额外参数。
`matter` 已是项目依赖（`gray-matter`），无新依赖引入。

---

## 12. 文件改动清单

| 文件                          | 操作                                                                                 | 改动量     |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| `src/types.ts`                | `MemoryFile` 加 `project?: string`                                                   | 1 行       |
| `src/core/store.ts`           | 加 `resolveProjectId()` + `writePending()` + `writeMemory`/`loadFile` 处理 `project` | ~30 行     |
| `src/core/queue-processor.ts` | 新建                                                                                 | ~55 行     |
| `src/commands/capture.ts`     | 替换步骤 4-5，移除 `isDuplicate`                                                     | ~15 行改动 |
| `src/commands/workspace.ts`   | publish 前加 per-file project 校验                                                   | ~10 行改动 |
| `.memobank/.gitignore`        | 加 `.pending/`                                                                       | 1 行       |

**无新 CLI 命令，无新配置项，无新 npm 依赖。**

---

## 13. 不在本 spec 范围内

- Phase 2/3：触发器（cron、idle timer、CI/CD）、批量 LLM 分析、模式检测
- Smart Dedup：语义去重（Phase 1 保留 name 精确匹配）
- Hybrid Search：LanceDB BM25 融合检索
- `memo process-queue` CLI 命令（Phase 2 时添加）
- projectId 不匹配的 quarantine 目录（Phase 2 可选引入）
