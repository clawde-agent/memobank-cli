# Promptfoo + 本地 LLM 配置指南

## 环境要求

- Node.js 22+（系统级，非 pi-node）
- llamacpp 本地服务

### 启动本地模型服务

```bash
llama-server -m /path/to/model.gguf --port 8080 --ctx-size 8192 -ngl 99
```

验证：

```bash
curl http://localhost:8080/v1/models
```

---

## 目录结构

```
evals/
  promptfooconfig.yaml
  prompts/
    main.json
  output.json          # gitignore
run-evals.ps1          # Windows 专用
```

---

## 配置

### `evals/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: '项目行为测试'

providers:
  - id: openai:chat:model-name.gguf # 与服务端模型名一致
    label: local
    config:
      apiBaseUrl: http://localhost:8080/v1
      apiKey: local
      temperature: 0
      max_tokens: 1024

prompts:
  - file://prompts/main.json

defaultTest:
  options:
    provider:
      id: openai:chat:model-name.gguf
      config:
        apiBaseUrl: http://localhost:8080/v1
        apiKey: local
  assert:
    - type: latency
      threshold: 120000

tests:
  - description: '场景描述'
    threshold: 0.5 # icontains(weight:3) 通过即整体通过
    vars:
      user_input: '...'
    assert:
      - type: icontains # 确定性，免费
        value: '关键词'
        weight: 3
        metric: my-metric
      - type: llm-rubric # 语义判断，慢
        value: '回复满足 X 条件'
        weight: 2
        metric: my-quality
```

### `evals/prompts/main.json`

```json
[
  { "role": "system", "content": "系统 prompt。{{system_extra}}" },
  { "role": "user", "content": "{{user_input}}" }
]
```

---

## 运行

### Windows（绕过 pi-node PATH 问题）

`run-evals.ps1`：

```powershell
$npx = "C:\Program Files\nodejs\npx.cmd"
& $npx promptfoo@latest eval -c evals/promptfooconfig.yaml -o evals/output.json --no-cache --no-share @args
```

```powershell
.\run-evals.ps1
```

### Mac / Linux

```bash
npx promptfoo@latest eval -c evals/promptfooconfig.yaml -o evals/output.json --no-cache --no-share
```

### package.json

```json
"test:evals": "promptfoo eval -c evals/promptfooconfig.yaml -o evals/output.json --no-cache --no-share"
```

### 验证配置

```bash
npx promptfoo@latest validate config -c evals/promptfooconfig.yaml
```

---

## Dashboard

```bash
npx promptfoo@latest view   # 打开 http://localhost:15500
```

---

## 断言参考

| 类型         | 速度 | 适用场景        |
| ------------ | ---- | --------------- |
| `icontains`  | 即时 | 关键词/命令出现 |
| `regex`      | 即时 | 格式校验        |
| `is-json`    | 即时 | 结构校验        |
| `javascript` | 即时 | 自定义逻辑      |
| `llm-rubric` | 慢   | 语义/顺序/质量  |

**推荐权重配置：**

```yaml
threshold: 0.5
assert:
  - type: icontains
    weight: 3 # 确定性主导
  - type: llm-rubric
    weight: 2 # 加分项，失效时不一票否决
```

---

## 常见问题

| 症状                               | 原因                   | 解决                             |
| ---------------------------------- | ---------------------- | -------------------------------- |
| `Cannot find module npm-prefix.js` | pi-node 劫持 PATH      | 用 `run-evals.ps1` 全路径调用    |
| llm-rubric 随机失败返回 `"string"` | 本地模型评分不稳定     | 加 `threshold: 0.5`              |
| 超时                               | 本地模型慢             | 调大 `latency threshold`（毫秒） |
| `model not found`                  | 模型 ID 与服务端不一致 | `curl .../v1/models` 确认 ID     |
| 结果不可重复                       | temperature > 0        | 设 `temperature: 0`              |
