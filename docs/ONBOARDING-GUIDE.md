# Memobank CLI 交互式 Onboarding 指南

## 快速开始

### 方式 1：交互式菜单（推荐）

```bash
# 进入项目目录
cd /path/to/your/project

# 启动交互式设置
memo onboarding

# 或者使用别名
memo init
memo setup
```

### 界面预览

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧠  Welcome to Memobank CLI Setup                       ║
║                                                           ║
║   Persistent memory for AI coding sessions                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📁 Project: my-project
📂 Location: /Users/you/.memobank/my-project

What would you like to do?

❯ ◉ Quick Setup - Recommended for most users
  ◯ Custom Setup - Configure each option
  ◯ Import Memories - From Claude Code, Gemini, etc.
  ◯ Platform Setup - Configure AI tools
  ◯ Embedding Setup - Vector search configuration
  ◯ Exit - Finish setup

Use ↑↓ arrows to navigate, Enter to select
```

---

## 菜单选项说明

### 1. Quick Setup（快速设置）

**适合人群：** 大多数用户，想要快速开始

**自动完成：**
- ✅ 检测 Ollama 并配置本地向量搜索
- ✅ 安装所有平台集成（Claude Code、Cursor、Codex）
- ✅ 创建默认配置

**操作：**
1. 选择 `Quick Setup`
2. 按 Enter
3. 等待自动完成

---

### 2. Custom Setup（自定义设置）

**适合人群：** 高级用户，想要精细控制

**步骤：**

#### Step 1: 选择 Embedding 提供商

```
Choose embedding provider:

❯ ◉ Ollama (Local, Free) - Recommended
  ◯ OpenAI (Cloud)
  ◯ Text Only (No embeddings)
```

**选项说明：**
- **Ollama**: 本地运行，免费，推荐
- **OpenAI**: 云端 API，需要 API Key
- **Text Only**: 不使用向量搜索

#### Step 2: 选择平台

```
Configure AI tools:

❯ [◉] Claude Code
  [◉] Cursor
  [◯] Codex (AGENTS.md)

↑↓ navigate, Space to toggle, Enter to confirm
```

**操作：**
- ↑↓ 导航
- Space 切换选择
- Enter 确认

---

### 3. Import Memories（导入记忆）

**适合人群：** 从其他 AI 工具迁移

**支持的工具：**
- Claude Code
- Gemini CLI
- Qwen Code

**操作：**
1. 选择 `Import Memories`
2. 选择源工具
3. 自动导入

---

### 4. Platform Setup（平台设置）

**适合人群：** 只想配置特定平台

**可选平台：**
- Claude Code
- Cursor
- Codex

---

### 5. Embedding Setup（向量搜索设置）

**适合人群：** 想要更改向量搜索配置

**选项：**
- Ollama（本地）
- OpenAI（云端）
- Azure OpenAI
- Text Only（无向量）

---

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 导航菜单项 |
| `Enter` | 确认选择 |
| `Space` | 切换复选框 |
| `Ctrl+C` | 退出 |

---

## 完整流程示例

### 示例 1：首次使用（快速设置）

```bash
# 1. 进入项目
cd my-project

# 2. 启动设置
memo onboarding

# 3. 选择 Quick Setup
# 4. 等待完成

✅ Setup Complete!

Configuration:
  Embedding Engine: lancedb
  Provider: ollama
  Model: mxbai-embed-large

Next steps:
  memo write lesson          Create your first memory
  memo recall "query"        Search memories
  memo lifecycle report      View memory statistics
```

### 示例 2：自定义配置

```bash
# 1. 启动设置
memo onboarding

# 2. 选择 Custom Setup

# 3. 选择 OpenAI embedding
❯ ◉ OpenAI (Cloud)

# 4. 选择平台（Space 切换）
❯ [◉] Claude Code
  [◯] Cursor
  [◉] Codex

# 5. 完成

✅ Custom Setup Complete!
```

---

## 配置后验证

```bash
# 检查配置
cat ~/.memobank/my-project/meta/config.yaml

# 测试回忆
memo recall "test query"

# 创建第一个记忆
memo write lesson
```

---

## 常见问题

### Q: 如何重新运行设置？

```bash
# 随时可以重新运行
memo onboarding

# 选择 Exit 可以随时退出
```

### Q: Ollama 未检测到怎么办？

```bash
# 1. 安装 Ollama
brew install ollama  # macOS
# 或访问 https://ollama.ai

# 2. 拉取模型
ollama pull mxbai-embed-large

# 3. 重新运行设置
memo onboarding
```

### Q: 如何更改已配置的平台？

```bash
# 重新运行设置
memo onboarding

# 选择 Platform Setup
# 选择要添加/移除的平台
```

---

## 命令对比

| 旧命令 | 新命令 | 说明 |
|--------|--------|------|
| `memo install` | `memo onboarding` | 交互式菜单（推荐） |
| `memo setup` | `memo onboarding` | 合并为同一命令 |
| - | `memo init` | 新别名 |

**向后兼容：**
- `memo install` 仍然可用（简化版）
- `memo setup` 仍然可用（指向 onboarding）

---

## 高级选项

### 指定项目路径

```bash
memo onboarding --repo /path/to/memobank
```

### 无交互模式（脚本使用）

```bash
# 快速安装（无提示）
memo install --all

# 仅配置特定平台
memo install --claude-code
memo install --cursor
```

---

## 总结

**推荐使用 `memo onboarding` 因为：**

1. ✅ 直观的菜单导航
2. ✅ 实时预览选项
3. ✅ 键盘快捷键支持
4. ✅ 自动检测环境
5. ✅ 一站式完成所有配置

**开始使用：**

```bash
cd your-project
memo onboarding
```
