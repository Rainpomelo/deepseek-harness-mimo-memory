# DeepSeek Harness - MiMoCode 工作区自动记忆插件 (MiMo Memory)

基于 **MiMoCode 记忆架构** 构建的 DeepSeek Harness 跨会话长期工作区持久记忆插件。

实现开局 **0 工具调用自动预注入**、**后台异步蒸馏与沉淀 (Dreaming)**、**跨会话任务断点续接 (Checkpoints)** 以及 **显式结构化落盘工具 (`update_project_memory`)**。

---

## 运行机制与核心架构

插件采用 MiMoCode 原版四层分级记忆与异步调度模型：

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 核心事实与架构契约 (MEMORY.md)                      │
│  - 跨会话全局持久生效，按标准三段式结构化维护                 │
│  - 开局 0 工具调用自动拼装注入 System Prompt 头部             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 工作区任务检查点 (checkpoint.md)                    │
│  - 记录最近工作区目标、任务阶段与活跃状态                      │
│  - 会话新建或重置时自动带出断点背景                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 后台异步蒸馏沉淀 (Dreaming & Distilling)            │
│  - 监听 Agent 空闲状态 (idle)，在后台提取已验证结论与用户约定 │
│  - 纯异步执行，不占用对话上下文 Token，不增加对话响应延迟     │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: 主动落盘工具 (update_project_memory)                │
│  - 供模型或用户显式调用，按 Markdown 章节精准追加或替换内容   │
└─────────────────────────────────────────────────────────────┘
```

---

## 插件是怎么运行的

### 1. 工作区路径映射与隔离 (`projectKey`)
插件对每个工作区目录（`cwd`）进行跨平台无冲突编码（如 `C:\Agent code\deepseek` 映射为 `--C-Agent~0020code-deepseek--`），将记忆统一隔离存储在 `~/.dsh/memory/<project-slug>/` 目录下，不同项目互不串扰。

### 2. 开局 0 工具调用自动预注入
在会话启动组装系统提示词时（`ctx.systemPrompt.context`），插件会自动读取对应工作区的 `MEMORY.md` 与 `checkpoint.md`，并在上下文最前部注入：
```markdown
# 📌 当前工作区持久记忆 (Project Memory)
【以下内容由 dsh-mimo-memory 自动注入，跨会话全局持久生效，你已具备这些背景知识，无需调工具查看】：
...
```
模型开局第一轮即直接掌握项目的硬件配置、架构选型与开发约定，无需先耗费 1~2 轮对话去执行 `view_file` 或 `grep` 检索历史文档。

### 3. 后台 Dreaming 自动蒸馏
当单次对话交互结束、Agent 状态转为 `idle` 时，插件自动启动后台分析：
- 扫描最近交互，识别用户明确给出的规则偏好（如“统一使用 TypeScript”、“记住这个配置”）与已验证的技术结论（如“Bug 根因是...”）；
- 自动更新 `checkpoint.md` 与 `MEMORY.md`，实现静默记忆生长。

### 4. 主动更新工具 (`update_project_memory`)
插件向 Agent 注册了主动记忆管理工具：
- `section`：指定写入的章节（如 `架构与技术选型`、`关键约定与环境规范`、`已验证结论与踩坑记录`）；
- `content`：沉淀的具体事实或规则；
- `action`：`append`（追加，自动去重）或 `replace`（覆盖）。

---

## 安装与配置

### 方式一：在本地 Profile 中引入（推荐）

1. 将本仓库 clone 到本地，例如 `C:/plugins/deepseek-harness-mimo-memory`。
2. 打开你的 Web profile 配置文件（`~/.dsh/profiles/web/package.json` 或 `C:\Users\<用户名>\.dsh\profiles\web\package.json`）。
3. 在 `dependencies` 与 `dsh.profile.bundles` 中添加插件：

```json
{
  "dependencies": {
    "dsh-mimo-memory": "file:C:/plugins/deepseek-harness-mimo-memory"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-mimo-memory"
      ]
    }
  }
}
```

4. 进入 profile 目录执行安装并启动：
```bash
cd ~/.dsh/profiles/web
pnpm install
dsh --profile web
```

---

### 方式二：直接从 GitHub 引用

在 profile 的 `package.json` 中配置：

```json
{
  "dependencies": {
    "dsh-mimo-memory": "github:Rainpomelo/deepseek-harness-mimo-memory"
  }
}
```

---

## 参数配置项

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `memoryRoot` | `string` | `~/.dsh/memory` | 全局持久记忆存储根目录 |
| `maxChars` | `number` | `12000` | 单工作区开局注入最大字符数（防止超出上下文） |
| `autoDream` | `boolean` | `true` | 是否启用 Agent 空闲时的后台自动蒸馏沉淀 |

---

## 记忆文件存储结构示例

```text
~/.dsh/memory/
├── --C-Agent~0020code-deepseek--/
│   ├── MEMORY.md          # 长期核心规则与技术沉淀
│   └── checkpoint.md      # 最近任务断点与阶段检查点
└── --C-Users-workspace-projectA--/
    ├── MEMORY.md
    └── checkpoint.md
```

---

## 开源协议

[MIT License](LICENSE)
