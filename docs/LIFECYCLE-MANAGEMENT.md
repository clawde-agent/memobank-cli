# Memobank 记忆生命周期管理指南

## 问题 1：记忆使用频率优化

### 自动追踪机制

Memobank 现在会自动追踪每个记忆的使用情况：

```typescript
// 每次回忆时自动记录
{
  memoryPath: "/path/to/memory.md",
  lastAccessed: "2026-03-19T10:00:00Z",
  accessCount: 15,
  recallQueries: ["redis", "connection pool", "database"]
}
```

### 记忆分级系统

根据访问频率，记忆自动分为三级：

| 等级 | 条件 | 处理方式 |
|------|------|----------|
| **Core** (核心) | 访问≥10 次 | 优先检索，永不归档 |
| **Working** (工作) | 正常访问 | 正常检索 |
| **Peripheral** (边缘) | 90 天无访问 | 降低优先级，建议归档 |

### 查看记忆状态

```bash
# 查看完整生命周期报告
memo lifecycle report

# 输出示例：
## Memory Lifecycle Report

**Total Memories:** 50

### Tier Distribution
- Core (frequently accessed): 5
- Working (active): 35
- Peripheral (inactive): 10

### Archival Candidates (10)
- redis-pool-fix (180 days inactive)
- old-deployment-flow (200 days inactive)
...
```

### 按等级查看

```bash
# 查看核心记忆
memo lifecycle --tier core

# 查看边缘记忆
memo lifecycle --tier peripheral
```

### 归档不活跃记忆

```bash
# 查看可归档的记忆
memo lifecycle archive

# 归档特定记忆
memo lifecycle archive --path lessons/2023-01-01-old-fix.md
```

### 删除记忆

```bash
# 删除记忆（谨慎使用）
memo lifecycle delete --path lessons/obsolete.md
```

---

## 问题 2：错误记忆修正

### 修正机制

当发现记忆有错误时：

#### 方式 1：直接编辑文件

```bash
# 找到记忆文件
ls ~/.memobank/<project>/lessons/

# 直接编辑
vim ~/.memobank/<project>/lessons/2026-03-19-redis-fix.md

# 修改后保存
```

#### 方式 2：使用修正命令

```bash
# 记录修正（会追踪修正历史）
memo correct lessons/2026-03-19-redis-fix.md \
  --reason "Original solution had incorrect pool size"
```

#### 方式 3：重新创建

```bash
# 删除错误的
rm ~/.memobank/<project>/lessons/2026-03-19-redis-fix.md

# 创建正确的
memo write lesson \
  --name="redis-fix-corrected" \
  --description="Corrected Redis fix" \
  --content="..."
```

### 修正追踪

系统会记录每次修正：

```json
{
  "lessons/2026-03-19-redis-fix.md": {
    "corrections": [
      {
        "date": "2026-03-19T10:00:00Z",
        "originalText": "pool size = 5",
        "correctedText": "pool size = 10",
        "reason": "Incorrect pool size"
      }
    ],
    "flaggedForReview": false
  }
}
```

### 查看需要复审的记忆

```bash
# 查看被多次修正的记忆
memo lifecycle flagged

# 输出示例：
🚩 Flagged Memories (2)

These memories have been corrected multiple times:

- [lesson] redis-pool-fix
  Redis connection pool solution
  Path: /path/to/memory.md

- [decision] database-choice
  Database selection rationale
  Path: /path/to/memory.md
```

---

## 最佳实践

### 1. 定期审查

```bash
# 每月审查一次
memo lifecycle report

# 查看边缘记忆
memo lifecycle --tier peripheral

# 考虑是否删除或归档
```

### 2. 核心记忆保护

```bash
# 核心记忆通常不应该删除
# 它们是你最常使用的知识

memo lifecycle --tier core
# 审查这些记忆的质量
```

### 3. 错误修正流程

```
发现错误 → 记录修正 → 更新内容 → 验证修正
    ↓
多次修正 → 标记复审 → 团队讨论 → 最终确认
```

### 4. 团队共享记忆

```bash
# 团队项目中，修正前通知团队
git pull origin main  # 获取最新

# 修正后提交
git add .
git commit -m "fix: correct redis pool size in memory"
git push

# 团队成员同步
git pull origin main
```

---

## 配置选项

在 `meta/config.yaml` 中配置：

```yaml
lifecycle:
  # 核心记忆阈值（访问次数）
  coreThreshold: 10
  
  # 边缘记忆阈值（无访问天数）
  peripheralThreshold: 90
  
  # 归档建议阈值（无访问天数）
  archiveAfterDays: 180
  
  # 删除建议阈值（归档后天数）
  deleteAfterDays: 365
  
  # 允许修正追踪
  allowCorrections: true
  
  # 修正次数阈值（超过则标记复审）
  correctionThreshold: 3
```

---

## 命令参考

### `memo lifecycle [options]`

管理记忆生命周期。

| 选项 | 说明 |
|------|------|
| `--report` | 生成完整报告（默认） |
| `--tier <tier>` | 查看特定等级（core/working/peripheral） |
| `--archive` | 查看可归档的记忆 |
| `--delete` | 删除记忆（需 --path） |
| `--flagged` | 查看标记复审的记忆 |

### `memo correct <path> [options]`

记录记忆修正。

| 选项 | 说明 |
|------|------|
| `--reason <text>` | 修正原因 |

---

## 实际示例

### 示例 1：清理过期记忆

```bash
# 1. 查看报告
memo lifecycle report

# 2. 查看边缘记忆
memo lifecycle --tier peripheral

# 3. 查看可归档的
memo lifecycle archive

# 4. 归档过时的
memo lifecycle archive --path lessons/2023-obsolete.md
```

### 示例 2：修正错误记忆

```bash
# 1. 发现记忆有错误
memo recall "redis pool"

# 2. 查看原始文件
cat ~/.memobank/project/lessons/redis-pool.md

# 3. 记录修正
memo correct lessons/redis-pool.md \
  --reason "Pool size should be 10, not 5"

# 4. 编辑内容
vim ~/.memobank/project/lessons/redis-pool.md

# 5. 验证修正
memo recall "redis pool"
```

### 示例 3：团队复审

```bash
# 1. 查看标记的记忆
memo lifecycle flagged

# 2. 团队讨论这些记忆

# 3. 决定保留/修改/删除

# 4. 提交更改
git add .
git commit -m "review: fix flagged memories"
git push
```

---

## 总结

### 记忆优化策略

| 情况 | 处理方式 |
|------|----------|
| 经常访问 | 保持核心，优先检索 |
| 很久不访问 | 降低优先级，建议归档 |
| 内容错误 | 记录修正，更新内容 |
| 多次修正 | 标记复审，团队讨论 |
| 完全过时 | 归档或删除 |

### 黄金法则

> **记忆是活的文档，不是一成不变的。**
> 
> 定期审查、及时修正、果断清理。
