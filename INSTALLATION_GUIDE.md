# DeepSeek Harness - MiMoCode 记忆插件 安装配置指南

---

## 环境要求

- Node.js `>= 18.0.0`
- pnpm `>= 8.0.0`
- DeepSeek Harness CLI / Web 运行环境

---

## 本地安装步骤

### 1. 配置 Profile 依赖

打开你的 Web profile 配置文件（`~/.dsh/profiles/web/package.json` 或 `C:\Users\<用户名>\.dsh\profiles\web\package.json`）：

在 `dependencies` 与 `dsh.profile.bundles` 中引入本插件：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-mimo-memory": "file:C:/Agent code/deepseek-harness-插件/deepseek-harness-mimo-memory"
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

> 提示：在 Windows 环境下填写本地路径时，请使用正斜杠 `/`。

---

### 2. 执行安装并启动

进入 profile 目录安装依赖：

```bash
cd C:\Users\<用户名>\.dsh\profiles\web
pnpm install
```

启动 DeepSeek Harness：

```bash
dsh --profile web
```

---

## 验证与使用

### 1. 验证开局 0 工具注入
在新开会话中直接向 Agent 提问工作区约定，Agent 会直接基于注入的 `MEMORY.md` 回答，无需调用任何文件读取工具。

### 2. 主动沉淀新结论
在对话中指示 Agent（例如“把这套规范记录到项目记忆中”），Agent 会调用 `update_project_memory` 工具将其结构化追加到持久存储中。

### 3. 查看已沉淀的记忆文件
所有项目的记忆文件保存在：
`~/.dsh/memory/<项目目录编码>/MEMORY.md`
可以直接使用文本编辑器查看或编辑。
