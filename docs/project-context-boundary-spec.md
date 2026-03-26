# 🛡️ 项目上下文感知与边界控制

## 技术规格说明书 (Specification)

**版本**: v1.0-draft  
**日期**: 2026-03-26  
**范围**: 防止跨项目记忆污染，实现项目级隔离

---

## 1. 概述

### 1.1 问题背景

**典型场景**：

```
1. 用户在项目 A 工作 → 产生记忆 "A 项目的 API 设计决策"
2. 用户切换到项目 B → 会话上下文已切换，但记忆系统无感知
3. 用户执行 `memo capture` → 把 A 项目的记忆错误发布到 B 项目
4. 结果：B 项目的 workspace 被污染，团队成员看到不相关的记忆
```

**根本原因**：

- 当前 memobank-cli **缺少项目边界感知**
- `capture` 命令不知道"当前会话属于哪个项目"
- 记忆写入时没有项目归属校验
- `workspace publish` 缺少跨项目检查

### 1.2 用户痛点

| 场景                | 当前行为         | 期望行为                   |
| ------------------- | ---------------- | -------------------------- |
| 多项目并行开发      | 无感知，容易混淆 | 明确提示当前项目           |
| 切换项目后 capture  | 可能写入错误项目 | 自动检测并阻止             |
| workspace publish   | 无项目归属检查   | 验证记忆与当前项目匹配     |
| 查看 workspace 历史 | 无法追溯项目来源 | 清晰标注每个记忆的项目归属 |

### 1.3 设计目标

1. **项目感知**：用户始终知道当前在哪个项目操作
2. **自动防护**：系统自动阻止跨项目记忆污染
3. **显式切换**：项目切换需要显式确认
4. **可追溯**：每个记忆都有清晰的项目归属标识

---

## 2. 技术方案

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    memobank-cli                         │
└─────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────┐                   ┌─────────────────┐
│ Project Context │                   │    Boundary     │
│    Awareness    │                   │    Control      │
│                 │                   │                 │
│ - 项目上下文解析│                   │ - 发布前校验    │
│ - 项目标签自动  │                   │ - 个人专属类型  │
│ - 显式切换确认  │                   │ - 跨项目检测    │
└─────────────────┘                   └─────────────────┘
         │                                     │
         └──────────────────┬──────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────┐
         │   Project-Aware Memory Store     │
         │   - 项目标签                      │
         │   - 作用域隔离                    │
         │   - 审计追溯                      │
         └──────────────────────────────────┘
```

### 2.2 核心概念

| 概念                | 定义                     | 示例                              |
| ------------------- | ------------------------ | --------------------------------- |
| **Project ID**      | 项目唯一标识             | `my-api-project`                  |
| **Project Context** | 当前会话的项目上下文     | `{ projectId, repoRoot, scopes }` |
| **Project Tag**     | 记忆的项目归属标签       | `project:my-api-project`          |
| **Personal Memory** | 个人专属记忆（不跨项目） | `preference`, `profile`           |
| **Shared Memory**   | 可跨项目共享的记忆       | `architecture`, `workflow`        |

---

## 3. 详细设计

### 3.1 项目上下文解析

**文件**: `src/core/project-context.ts`（新建）

```typescript
/**
 * 项目上下文感知模块
 * 解析当前会话所属的项目，提供项目边界校验能力
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from '../config';
import { findRepoRoot } from './store';
import type { MemoryFile, MemoryType } from '../types';

/**
 * 项目上下文信息
 */
export interface ProjectContext {
  /** 项目唯一标识（从 git remote 或 config 解析） */
  projectId: string;

  /** 项目名称（人类可读） */
  projectName: string;

  /** 项目 repo 根目录（.memobank 所在目录） */
  repoRoot: string;

  /** 该项目可访问的 workspace scopes */
  workspaceScopes: string[];

  /** 项目锁状态 */
  lockStatus?: 'locked' | 'unlocked';
}

/**
 * 从当前工作目录解析项目上下文
 */
export function getCurrentProjectContext(cwd: string): ProjectContext | null {
  try {
    const repoRoot = findRepoRoot(cwd);
    const config = loadConfig(repoRoot);

    // 1. 解析 projectId（优先从 git remote 解析，fallback 到 config.project.name）
    const projectId = resolveProjectId(repoRoot) || config.project?.name || 'unknown';
    const projectName = config.project?.name || projectId;

    // 2. 解析 workspace scopes
    const workspaceScopes = config.workspace?.scopes || [];

    // 3. 检查项目锁状态
    const lockStatus = getProjectLockStatus();

    return {
      projectId,
      projectName,
      repoRoot,
      workspaceScopes,
      lockStatus,
    };
  } catch (error) {
    console.warn(`Could not resolve project context: ${(error as Error).message}`);
    return null;
  }
}

/**
 * 从 git remote 解析项目 ID
 * 格式：git@github.com:org/repo.git → org/repo
 */
function resolveProjectId(repoRoot: string): string | null {
  try {
    // 查找 git root（不是 .memobank 目录，而是上层代码仓库）
    let current = repoRoot;
    while (current !== path.dirname(current)) {
      const gitDir = path.join(current, '.git');
      if (fs.existsSync(gitDir)) {
        // 找到 git repo，解析 remote origin
        const remote = execSync('git remote get-url origin', {
          cwd: current,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();

        // 解析 git@github.com:org/repo.git → org/repo
        const match = remote.match(/[:/]([^/:]+)\/([^/.]+)(?:\.git)?$/);
        if (match) {
          return `${match[1]}/${match[2]}`;
        }
      }
      current = path.dirname(current);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 获取项目锁状态
 */
function getProjectLockStatus(): 'locked' | 'unlocked' {
  const lockFile = getProjectLockFilePath();
  if (!fs.existsSync(lockFile)) {
    return 'unlocked';
  }

  try {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
    // 锁超过 24 小时自动过期
    const lockedAt = new Date(lock.lockedAt).getTime();
    const now = Date.now();
    const hoursSinceLock = (now - lockedAt) / (1000 * 60 * 60);

    if (hoursSinceLock > 24) {
      fs.unlinkSync(lockFile);
      return 'unlocked';
    }

    return 'locked';
  } catch {
    return 'unlocked';
  }
}

/**
 * 获取项目锁文件路径
 */
function getProjectLockFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.memobank', '.project-lock');
}

/**
 * 锁定当前项目
 */
export function lockProject(cwd: string): boolean {
  const context = getCurrentProjectContext(cwd);
  if (!context) {
    console.error('Could not resolve project context');
    return false;
  }

  const lockFile = getProjectLockFilePath();
  const lockDir = path.dirname(lockFile);

  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  const lock = {
    projectId: context.projectId,
    repoRoot: context.repoRoot,
    lockedAt: new Date().toISOString(),
    lockedBy: process.env.USER || 'unknown',
  };

  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2));
  console.log(`✓ Project locked: ${context.projectName} (${context.projectId})`);
  console.log('  Run `memo project unlock` to release.');

  return true;
}

/**
 * 解锁项目
 */
export function unlockProject(): boolean {
  const lockFile = getProjectLockFilePath();

  if (!fs.existsSync(lockFile)) {
    console.log('Project is not locked.');
    return true;
  }

  try {
    fs.unlinkSync(lockFile);
    console.log('✓ Project unlocked.');
    return true;
  } catch (error) {
    console.error(`Failed to unlock: ${(error as Error).message}`);
    return false;
  }
}

/**
 * 验证记忆的项目归属
 */
export function verifyMemoryProjectAffinity(
  memory: MemoryFile,
  context: ProjectContext
): { valid: boolean; reason?: string; suggestion?: string } {
  // 1. 检查是否有项目标签
  const projectTag = memory.tags.find((t) => t.startsWith('project:'));

  if (!projectTag) {
    return {
      valid: false,
      reason: 'Missing project tag',
      suggestion: `Add tag: project:${context.projectId}`,
    };
  }

  // 2. 检查标签是否匹配当前项目
  const memoryProjectId = projectTag.replace('project:', '');
  if (memoryProjectId !== context.projectId) {
    return {
      valid: false,
      reason: `Memory belongs to project "${memoryProjectId}", current is "${context.projectId}"`,
      suggestion: `Switch to project "${memoryProjectId}" or update the tag`,
    };
  }

  return { valid: true };
}

/**
 * 为记忆自动添加项目标签
 */
export function addProjectTag(memory: MemoryFile, context: ProjectContext): MemoryFile {
  const existingProjectTag = memory.tags.find((t) => t.startsWith('project:'));

  if (existingProjectTag) {
    // 已有项目标签，验证是否匹配
    const affinity = verifyMemoryProjectAffinity(memory, context);
    if (!affinity.valid) {
      throw new Error(`Project affinity check failed: ${affinity.reason}`);
    }
    return memory;
  }

  // 添加项目标签
  return {
    ...memory,
    tags: [...memory.tags, `project:${context.projectId}`],
  };
}

/**
 * 检查记忆类型是否允许发布到 workspace
 */
export function isPublishAllowed(
  memory: MemoryFile,
  context: ProjectContext
): { allowed: boolean; reason?: string } {
  const config = loadConfig(context.repoRoot);
  const boundary = config.workspace?.boundary;

  // 检查个人专属类型
  if (boundary?.personalOnly?.includes(memory.type)) {
    return {
      allowed: false,
      reason: `${memory.type} memories are personal-only and cannot be published to workspace.`,
    };
  }

  // 检查是否需要审查
  if (boundary?.requireReview?.some((tag) => memory.tags.includes(tag))) {
    return {
      allowed: false,
      reason: `This memory requires review before publish.`,
      suggestion: 'Run `memo workspace publish --force-review` to override.',
    };
  }

  // 检查项目归属
  const affinity = verifyMemoryProjectAffinity(memory, context);
  if (!affinity.valid) {
    return {
      allowed: false,
      reason: affinity.reason,
      suggestion: affinity.suggestion,
    };
  }

  return { allowed: true };
}
```

---

### 3.2 配置扩展

**文件**: `src/config.ts`

**新增配置项**：

```yaml
# meta/config.yaml

# 项目边界控制
workspace:
  boundary:
    # 个人专属记忆类型（默认不发布到 workspace）
    personalOnly:
      - 'preference'
      - 'profile'
      - 'local-config'

    # 发布前需要审查的记忆类型
    requireReview:
      - 'security-sensitive'
      - 'credentials-related'
      - 'internal-only'

    # 自动脱敏规则
    autoRedact:
      patterns:
        - 'internal-only-*'
        - 'draft-*'
        - 'wip-*'

    # 项目隔离策略
    projectIsolation:
      enabled: true
      # 记忆必须包含项目标签
      requireProjectTag: true
      # 发布前检查项目匹配
      verifyProjectMatch: true
      # 跨项目共享的记忆类型
      crossProjectAllowed:
        - 'architecture'
        - 'workflow'
```

**默认配置**：

```typescript
const DEFAULT_CONFIG: MemoConfig = {
  // ... 现有配置
  workspace: {
    boundary: {
      personalOnly: ['preference', 'profile'],
      requireReview: [],
      autoRedact: { patterns: [] },
      projectIsolation: {
        enabled: true,
        requireProjectTag: true,
        verifyProjectMatch: true,
        crossProjectAllowed: ['architecture', 'workflow'],
      },
    },
  },
};
```

---

### 3.3 Capture 命令集成

**文件**: `src/commands/capture.ts`

**修改的 `capture()` 方法**：

```typescript
import {
  getCurrentProjectContext,
  addProjectTag,
  verifyMemoryProjectAffinity,
} from '../core/project-context';

export async function capture(options: CaptureOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // ========== 新增：项目上下文感知 ==========
  const projectContext = getCurrentProjectContext(cwd);

  const isSilent = options.silent || process.env.SILENT === '1';
  const log = (...args: unknown[]): void => {
    if (!isSilent) {
      console.log(...args);
    }
  };

  // 显示当前项目上下文
  if (projectContext) {
    log(`📁 Current project: ${projectContext.projectName}`);
    log(`   Project ID: ${projectContext.projectId}`);
    log(`   Workspace scopes: ${projectContext.workspaceScopes.join(', ') || 'none'}`);

    if (projectContext.lockStatus === 'locked') {
      log(`   🔒 Project locked`);
    }
  } else {
    log(`⚠️  Could not resolve project context`);
  }

  // 1. 读取 session 文本（现有逻辑）
  // 2. 脱敏（现有逻辑）
  // 3. LLM 提取（现有逻辑）
  const extracted = await extract(sanitized, process.env.ANTHROPIC_API_KEY);

  if (extracted.length === 0) {
    console.log('No memories extracted from session');
    return;
  }

  // 4. 加载现有记忆（现有逻辑）
  const existingMemories = loadAll(repoRoot);

  // ========== 新增：项目归属校验 ==========
  const memoriesToWrite: MemoryFile[] = [];
  const skipLog: Array<{ name: string; reason: string }> = [];

  for (const item of extracted) {
    let memory: MemoryFile = {
      name: item.name,
      type: item.type,
      description: item.description,
      tags: item.tags,
      confidence: item.confidence,
      content: item.content,
      created: new Date().toISOString(),
    };

    // 自动添加项目标签
    if (projectContext && config.workspace?.boundary?.projectIsolation?.requireProjectTag) {
      try {
        memory = addProjectTag(memory, projectContext);
      } catch (error) {
        skipLog.push({
          name: item.name,
          reason: `Project tag conflict: ${(error as Error).message}`,
        });
        continue;
      }
    }

    // 验证项目归属
    if (projectContext) {
      const affinity = verifyMemoryProjectAffinity(memory, projectContext);
      if (!affinity.valid) {
        skipLog.push({ name: item.name, reason: affinity.reason });
        continue;
      }
    }

    memoriesToWrite.push(memory);
  }

  // 5. 写入记忆（现有逻辑）
  for (const memory of memoriesToWrite) {
    const filePath = writeMemory(repoRoot, memory);
    log(`Created: ${filePath}`);
  }

  // 6. 打印摘要
  console.log(`\n📝 Captured ${memoriesToWrite.length} memories`);
  if (skipLog.length > 0) {
    console.log(`⊘ Skipped ${skipLog.length} memories:`);
    for (const log of skipLog) {
      console.log(`   ${log.name}: ${log.reason}`);
    }
  }
}
```

---

### 3.4 Workspace Publish 集成

**文件**: `src/commands/workspace.ts`

**修改的 `workspacePublish()` 方法**：

```typescript
import {
  getCurrentProjectContext,
  verifyMemoryProjectAffinity,
  isPublishAllowed,
} from '../core/project-context';

export async function workspacePublish(
  filePath: string,
  repoRoot: string,
  wsDirOverride?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // ========== 新增：项目上下文与边界检查 ==========
  const projectContext = getCurrentProjectContext(repoRoot);

  if (!projectContext) {
    console.error('⚠️  Could not resolve project context. Publish aborted.');
    return;
  }

  // 加载记忆文件
  const memory = loadFile(filePath);

  // 检查是否允许发布
  const publishCheck = isPublishAllowed(memory, projectContext);
  if (!publishCheck.allowed) {
    console.error(`❌ Cannot publish: ${publishCheck.reason}`);
    if (publishCheck.suggestion) {
      console.error(`   💡 ${publishCheck.suggestion}`);
    }
    return;
  }

  // 秘密扫描（现有逻辑）
  try {
    const findings = scanFile(filePath);
    if (findings.length > 0) {
      console.error('⚠️  Potential secrets found — aborting publish:');
      findings.forEach((f) => console.error(`  ${f}`));
      console.error('→ Fix manually or run: memo scan --fix <file>');
      process.exit(1);
    }
  } catch {
    /* scan module unavailable — skip */
  }

  // 继续发布流程（现有逻辑）
  const config = loadConfig(repoRoot);
  const wsName = config.workspace?.remote
    ? path.basename(config.workspace.remote, '.git')
    : '_workspace';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = wsDirOverride ?? path.join(home, '.memobank', '_workspace', wsName);

  if (!fs.existsSync(wsDir)) {
    throw new Error(`Workspace not initialized. Run: memo workspace init <remote-url>`);
  }

  // 计算目标路径（保持项目隔离）
  const rel = path.relative(repoRoot, filePath);
  const dst = path.join(wsDir, projectContext.projectId, rel);

  // 创建项目子目录（如果不存在）
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  // 复制文件
  fs.copyFileSync(filePath, dst);
  console.log(`✓ Published: ${rel}`);
  console.log(`   Workspace: ${projectContext.projectId}/${rel}`);
  console.log('   Run: memo workspace sync --push to share with team.');
}
```

---

### 3.5 新增命令：项目管理

**文件**: `src/commands/project.ts`（新建）

```typescript
/**
 * Project context management commands
 * memo project info    — show current project context
 * memo project lock    — lock current project (prevent cross-project operations)
 * memo project unlock  — release project lock
 * memo project switch  — switch to another project
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCurrentProjectContext, lockProject, unlockProject } from '../core/project-context';
import { findRepoRoot } from '../core/store';

export interface ProjectInfoOptions {
  json?: boolean;
}

/**
 * Show current project context
 */
export function projectInfo(options: ProjectInfoOptions = {}): void {
  const cwd = process.cwd();
  const context = getCurrentProjectContext(cwd);

  if (!context) {
    console.error('Could not resolve project context');
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  console.log('📁 Project Context');
  console.log('─────────────────────────────────────');
  console.log(`  Name:        ${context.projectName}`);
  console.log(`  ID:          ${context.projectId}`);
  console.log(`  Repo:        ${context.repoRoot}`);
  console.log(`  Lock:        ${context.lockStatus === 'locked' ? '🔒 Locked' : '🔓 Unlocked'}`);
  console.log(`  Scopes:      ${context.workspaceScopes.join(', ') || 'none'}`);
}

/**
 * Lock current project
 */
export function projectLock(): void {
  const cwd = process.cwd();
  const success = lockProject(cwd);
  if (!success) {
    process.exit(1);
  }
}

/**
 * Unlock project
 */
export function projectUnlock(): void {
  const success = unlockProject();
  if (!success) {
    process.exit(1);
  }
}

/**
 * Switch to another project
 */
export function projectSwitch(targetPath: string): void {
  const targetRoot = findRepoRoot(targetPath);

  if (!fs.existsSync(targetRoot)) {
    console.error(`Project not found: ${targetPath}`);
    process.exit(1);
  }

  // Change current working directory
  process.chdir(targetRoot);

  const context = getCurrentProjectContext(targetRoot);
  if (!context) {
    console.error(`Could not resolve project context for: ${targetPath}`);
    process.exit(1);
  }

  console.log(`✓ Switched to project: ${context.projectName}`);
  console.log(`  Path: ${targetRoot}`);
}
```

**CLI 集成**（`src/cli.ts`）：

```typescript
// Add project subcommands
const projectCmd = program.command('project').description('Project context management');

projectCmd
  .command('info')
  .description('Show current project context')
  .option('--json', 'Output as JSON')
  .action((options) => projectInfo(options));

projectCmd
  .command('lock')
  .description('Lock current project')
  .action(() => projectLock());

projectCmd
  .command('unlock')
  .description('Unlock project')
  .action(() => projectUnlock());

projectCmd
  .command('switch <path>')
  .description('Switch to another project')
  .action((path) => projectSwitch(path));
```

---

### 3.6 Workspace 项目隔离存储

**文件**: `src/core/store.ts`

**修改的 `loadAll()` 方法**（支持项目过滤）：

```typescript
export function loadAll(
  repoRoot: string,
  scope: MemoryScope | 'all' = 'all',
  globalDir?: string,
  workspaceDir?: string,
  options?: {
    projectId?: string; // 过滤特定项目的记忆
  }
): MemoryFile[] {
  const seenFilenames = new Set<string>();
  const memories: MemoryFile[] = [];

  const addFromDir = (dir: string, tierScope: MemoryScope): void => {
    if (!fs.existsSync(dir)) {
      return;
    }
    const tierMemories = loadFromDir(dir, tierScope);
    for (const m of tierMemories) {
      // 项目过滤
      if (options?.projectId) {
        const projectTag = m.tags.find((t) => t.startsWith('project:'));
        if (!projectTag || projectTag.replace('project:', '') !== options.projectId) {
          continue; // 跳过不属于目标项目的记忆
        }
      }

      const filename = path.basename(m.path);
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        memories.push(m);
      }
    }
  };

  // ... 现有逻辑
}
```

---

## 4. 用户接口

### 4.1 命令增强

```bash
# 查看当前项目上下文
$ memo project info
📁 Project Context
─────────────────────────────────────
  Name:        my-api-project
  ID:          mycompany/my-api-project
  Repo:        /home/user/projects/my-api-project/.memobank
  Lock:        🔓 Unlocked
  Scopes:      workspace:default, workspace:platform-team

# 锁定当前项目（防止误操作）
$ memo project lock
✓ Project locked: mycompany/my-api-project
  Run `memo project unlock` to release.

# 解锁
$ memo project unlock
✓ Project unlocked.

# 切换项目
$ memo project switch /path/to/other-project
✓ Switched to project: other-project
  Path: /home/user/projects/other-project/.memobank

# Capture 时自动显示项目上下文
$ memo capture --auto
📁 Current project: my-api-project
   Project ID: mycompany/my-api-project
   Workspace scopes: workspace:default, workspace:platform-team
   🔒 Project locked

📊 Extracted 3 potential memories...
✓ 2 memories passed value filter
Created: /home/user/projects/my-api-project/.memobank/decision/2026-03-26-api-timeout.md
Created: /home/user/projects/my-api-project/.memobank/lesson/2026-03-26-error-handling.md

📝 Captured 2 memories

# Publish 时项目校验
$ memo workspace publish decision/api-timeout.md
❌ Cannot publish: Memory belongs to project "other-project", current is "mycompany/my-api-project"
   💡 Switch to project "other-project" or update the tag
```

### 4.2 配置文件示例

```yaml
# meta/config.yaml

project:
  name: my-api-project

workspace:
  remote: git@github.com:mycompany/platform-docs.git
  branch: main
  auto_sync: false

  # 边界控制配置
  boundary:
    # 个人专属类型
    personalOnly:
      - preference
      - profile

    # 需要审查的类型
    requireReview:
      - security-sensitive

    # 项目隔离
    projectIsolation:
      enabled: true
      requireProjectTag: true
      verifyProjectMatch: true
      crossProjectAllowed:
        - architecture
        - workflow
```

---

## 5. 测试计划

### 5.1 单元测试

**文件**: `tests/project-context.test.ts`（新建）

```typescript
describe('project-context', () => {
  describe('getCurrentProjectContext', () => {
    it('should resolve project from git remote', () => {
      // 测试从 git remote 解析项目 ID
    });

    it('should fallback to config.project.name', () => {
      // 测试 fallback 逻辑
    });

    it('should handle missing git remote', () => {
      // 测试无 git remote 的情况
    });
  });

  describe('verifyMemoryProjectAffinity', () => {
    it('should pass when project tags match', () => {
      // 测试项目标签匹配
    });

    it('should fail when project tags mismatch', () => {
      // 测试项目标签不匹配
    });

    it('should fail when missing project tag', () => {
      // 测试缺少项目标签
    });
  });

  describe('isPublishAllowed', () => {
    it('should allow publish for shared memory types', () => {
      // 测试允许发布的类型
    });

    it('should block personal-only types', () => {
      // 测试个人专属类型被阻止
    });

    it('should block memories requiring review', () => {
      // 测试需要审查的类型被阻止
    });
  });
});
```

### 5.2 集成测试

**测试场景**：

1. 在两个项目间切换，验证 capture 不会交叉污染
2. 尝试发布其他项目的记忆，验证被阻止
3. 项目锁定后，验证跨项目操作被阻止

---

## 6. 实施计划

### Phase 1：核心实现（3-4 天）

| 任务                               | 预计时间 |
| ---------------------------------- | -------- |
| 创建 `src/core/project-context.ts` | 1.5 天   |
| 修改 `config.ts` 添加边界配置      | 0.5 天   |
| 修改 `capture.ts` 集成项目校验     | 0.5 天   |
| 修改 `workspace.ts` 集成发布校验   | 0.5 天   |

### Phase 2：命令与文档（2-3 天）

| 任务                           | 预计时间 |
| ------------------------------ | -------- |
| 创建 `src/commands/project.ts` | 0.5 天   |
| CLI 集成（`src/cli.ts`）       | 0.25 天  |
| 修改 `store.ts` 支持项目过滤   | 0.5 天   |
| 编写单元测试                   | 0.75 天  |
| 文档更新                       | 0.5 天   |

### Phase 3：测试与优化（2-3 天）

| 任务                   | 预计时间 |
| ---------------------- | -------- |
| 集成测试（多项目场景） | 1 天     |
| 性能优化               | 0.5 天   |
| 用户文档与示例         | 0.5 天   |
| Bug 修复               | 0.5 天   |

---

## 7. 验收标准

### 功能验收

- [ ] 项目上下文正确解析（git remote 或 config）
- [ ] capture 自动添加项目标签
- [ ] 跨项目 capture 被正确阻止
- [ ] workspace publish 验证项目归属
- [ ] 个人专属类型被阻止发布
- [ ] `memo project info/lock/unlock/switch` 命令正常工作

### 用户体验验收

- [ ] 项目切换时有明确提示
- [ ] 错误操作时有清晰的错误信息和建议
- [ ] 项目锁 24 小时后自动过期
- [ ] 配置文件有合理默认值

### 兼容性验收

- [ ] 现有用户无需手动迁移
- [ ] 项目标签可选（配置开关）
- [ ] 所有现有测试通过

---

## 8. 风险与缓解

| 风险                 | 影响           | 缓解措施                        |
| -------------------- | -------------- | ------------------------------- |
| 现有记忆缺少项目标签 | 发布时被阻止   | 提供迁移脚本批量添加标签        |
| git remote 解析失败  | 项目 ID 不准确 | Fallback 到 config.project.name |
| 项目锁过期导致误操作 | 可能交叉污染   | 锁过期前发送提醒                |
| 配置复杂化           | 用户理解成本高 | 提供合理默认值，添加文档说明    |

---

## 9. 迁移指南

### 现有用户升级

```bash
# 1. 升级到新版本
npm install -g memobank-cli@latest

# 2. 查看当前项目上下文
memo project info

# 3. （可选）批量添加项目标签
memo migrate add-project-tags --project my-project-id

# 4. 启用项目隔离
# 编辑 meta/config.yaml，添加 workspace.boundary 配置
```

### 迁移脚本

```typescript
// scripts/migrate-add-project-tags.ts
// 为现有记忆批量添加项目标签

import { loadAll, writeMemory } from '../src/core/store';
import { findRepoRoot } from '../src/core/store';

export function addProjectTags(repoRoot: string, projectId: string): void {
  const memories = loadAll(repoRoot);

  for (const memory of memories) {
    const projectTag = memory.tags.find((t) => t.startsWith('project:'));
    if (projectTag) {
      continue; // 已有标签
    }

    // 添加项目标签
    memory.tags.push(`project:${projectId}`);

    // 写回文件
    writeMemory(repoRoot, memory);
    console.log(`Added project tag to: ${memory.name}`);
  }

  console.log(`✓ Migrated ${memories.length} memories`);
}
```

---

## 10. 总结

**核心价值**：

- ✅ 防止跨项目记忆污染
- ✅ 用户始终知道当前在哪个项目操作
- ✅ 发布前自动校验，避免人为错误
- ✅ 项目隔离，团队协作更清晰

**预期收益**：

- 跨项目记忆污染减少 ≥ 90%
- 用户项目切换困惑减少
- workspace 记忆质量提升（项目归属清晰）

**关键设计决策**：

1. **项目标签自动添加**：用户无感知，减少配置负担
2. **发布前校验**：最后一道防线，防止误发布
3. **项目锁**：显式防护，适合高风险操作场景
4. **git remote 解析**：自动识别项目，减少手动配置
