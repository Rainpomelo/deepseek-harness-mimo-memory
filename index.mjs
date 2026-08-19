import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";

export const name = "dsh-mimo-memory";
export const inject = ["systemPrompt", "tools"];

const DEFAULT_MEMORY_ROOT = resolve(os.homedir(), ".dsh", "memory");

function defineTool(options) {
  if (options && options.parameters && options.parameters.type !== "object") {
    const raw = options.parameters;
    const properties = {};
    const required = [];
    for (const [key, val] of Object.entries(raw)) {
      properties[key] = {
        type: val.type || "string",
        ...(val.description ? { description: val.description } : {}),
      };
      if (val.required) required.push(key);
    }
    options.parameters = {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
  return options;
}

function projectKey(cwd) {
  if (!cwd || typeof cwd !== "string" || cwd.length === 0) return "root";
  let readable = "";
  let separatorRun = false;
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += "~" + code.toString(16).toUpperCase().padStart(4, "0");
      separatorRun = false;
    }
  }
  const slug = readable.replace(/^-+/, "") || "root";
  return `--${slug.slice(0, 251)}--`;
}

function updateSectionInMarkdown(md, targetSection, newContent, action = "append") {
  const lines = md.split("\n");
  let sectionIndex = -1;
  let nextSectionIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const title = line.replace(/^#+\s*/, "").trim();
      if (title.toLowerCase().includes(targetSection.toLowerCase()) || targetSection.toLowerCase().includes(title.toLowerCase())) {
        sectionIndex = i;
      } else if (sectionIndex !== -1 && nextSectionIndex === -1) {
        nextSectionIndex = i;
      }
    }
  }

  if (sectionIndex === -1) {
    return md.trimEnd() + `\n\n## ${targetSection}\n- ${newContent}\n`;
  }

  const end = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const before = lines.slice(0, sectionIndex + 1);
  const middle = lines.slice(sectionIndex + 1, end);
  const after = lines.slice(end);

  let newMiddle = [];
  if (action === "replace") {
    newMiddle = [`- ${newContent}`];
  } else {
    const existing = middle.map(l => l.trim());
    if (existing.includes(`- ${newContent}`) || existing.includes(newContent)) {
      return md;
    }
    newMiddle = [...middle.filter(l => l.trim().length > 0), `- ${newContent}`];
  }

  return [...before, ...newMiddle, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

export function apply(ctx, config) {
  const root = (config && config.memoryRoot) || DEFAULT_MEMORY_ROOT;
  const maxChars = (config && config.maxChars) || 12000;
  const autoDream = config?.autoDream !== false;

  // 1. 开局 0 工具调用自动预注入 (Layer 1: MEMORY.md + Layer 2: Checkpoint)
  ctx.systemPrompt.context({
    name: "workspace-memory-context",
    order: 10,
    text: (assembleCtx) => {
      try {
        const cwd = assembleCtx.agent?.session?.header?.cwd || process.cwd();
        const slug = projectKey(cwd);
        const memPath = resolve(root, slug, "MEMORY.md");
        const cpPath = resolve(root, slug, "checkpoint.md");

        let injected = "";

        if (existsSync(memPath)) {
          let content = readFileSync(memPath, "utf8").trim();
          if (content.length > maxChars) {
            content = content.slice(0, maxChars) + "\n\n...(记忆条目过长，已自动截断)...";
          }
          if (content) {
            injected += `\n# 📌 当前工作区持久记忆 (Project Memory)\n【以下内容由 dsh-workspace-memory 自动注入，跨会话全局持久生效，你已具备这些背景知识，无需调工具查看】：\n\n${content}\n`;
          }
        }

        if (existsSync(cpPath)) {
          const cpContent = readFileSync(cpPath, "utf8").trim();
          if (cpContent && cpContent.length < 2000) {
            injected += `\n# ⏱️ 最近工作区任务检查点 (Latest Checkpoint)\n${cpContent}\n`;
          }
        }

        return injected;
      } catch (err) {
        ctx.logger?.warn?.(`[workspace-memory] 预注入失败: ${err.message}`);
      }
      return "";
    }
  });

  // 2. 主动工具：允许显式调用落盘 (update_project_memory)
  ctx.tools.register(defineTool({
    name: "update_project_memory",
    description: "更新或追加当前工作区的持久记忆 (MEMORY.md)。当在对话中敲定了新的技术选型、架构规范、环境配置或解决了复杂Bug时，必须调用此工具持久化沉淀，供后续所有新会话自动共享。",
    parameters: {
      section: {
        type: "string",
        required: true,
        description: "要记录的章节名称（例如：架构与技术选型、关键约定与环境规范、已验证结论与踩坑记录）"
      },
      content: {
        type: "string",
        required: true,
        description: "要沉淀的核心事实或规则，用简练陈述句（1~2句）表达"
      },
      action: {
        type: "string",
        required: true,
        description: "更新方式：'append'(追加到该章节末尾), 'replace'(替换该章节现有内容)"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          result: { type: "string" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: typeof value?.result === "string" ? value.result : String(value || "")
      }]
    },
    execute: async ({ section, content, action = "append" }, toolCtx) => {
      const cwd = toolCtx.agent?.session?.header?.cwd || process.cwd();
      const slug = projectKey(cwd);
      const dir = resolve(root, slug);
      const memPath = resolve(dir, "MEMORY.md");

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let current = "";
      if (existsSync(memPath)) {
        current = readFileSync(memPath, "utf8");
      } else {
        current = `# Project Memory: ${cwd}\n\n## 1. 架构与技术选型 (Architecture & Stack)\n\n## 2. 关键约定与环境规范 (Conventions & Environment)\n\n## 3. 已验证结论与踩坑记录 (Verified Facts & Gotchas)\n`;
      }

      const updated = updateSectionInMarkdown(current, section, content, action || "append");
      writeFileSync(memPath, updated, "utf8");
      const msg = `已成功持久化至当前工作区记忆（${memPath}）：\n- 章节: ${section}\n- 操作: ${action || "append"}\n- 内容: ${content}\n（该记忆将在后续所有新会话中自动开局预注入）`;
      return { result: msg };
    }
  }));

  // 3. MiMoCode 原版后台自动蒸馏与检查点沉淀 (Layer 3 & 4: Dreaming & Checkpoints)
  if (autoDream) {
    ctx.on("agent/status", async ({ agent, status }) => {
      if (status !== "idle" || !agent?.session) return;

      try {
        const cwd = agent.session.header?.cwd || process.cwd();
        const slug = projectKey(cwd);
        const dir = resolve(root, slug);
        const memPath = resolve(dir, "MEMORY.md");
        const cpPath = resolve(dir, "checkpoint.md");

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const events = agent.session.events || [];
        if (events.length === 0) return;

        const recentEvents = events.slice(-8);
        let userDirectives = [];
        let assistantConclusions = [];

        for (const ev of recentEvents) {
          if (ev.type === "user/message" && ev.content) {
            const text = typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content);
            if (/记住|约定|规范|以后都|必须|配置|修改为|采用/i.test(text)) {
              userDirectives.push(text.trim());
            }
          } else if (ev.type === "assistant/message" && ev.content) {
            const text = typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content);
            if (/已修复|根因是|验证通过|踩坑点|选型确定/i.test(text)) {
              assistantConclusions.push(text.slice(0, 200).trim());
            }
          }
        }

        if (userDirectives.length > 0 || assistantConclusions.length > 0) {
          let currentMem = existsSync(memPath)
            ? readFileSync(memPath, "utf8")
            : `# Project Memory: ${cwd}\n\n## 1. 架构与技术选型 (Architecture & Stack)\n\n## 2. 关键约定与环境规范 (Conventions & Environment)\n\n## 3. 已验证结论与踩坑记录 (Verified Facts & Gotchas)\n`;

          for (const d of userDirectives) {
            currentMem = updateSectionInMarkdown(currentMem, "关键约定", d.replace(/^用户[：:]\s*/, ""), "append");
          }
          for (const c of assistantConclusions) {
            currentMem = updateSectionInMarkdown(currentMem, "已验证结论", c, "append");
          }

          writeFileSync(memPath, currentMem, "utf8");
        }

        const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const lastUser = events.filter(e => e.type === "user/message").slice(-1)[0]?.content || "无活跃任务";
        const checkpointData = `### 任务状态快照 (${timestamp})\n- 最近目标: ${typeof lastUser === 'string' ? lastUser.slice(0, 100) : '任务进行中'}\n- 活跃工作区: ${cwd}\n`;
        writeFileSync(cpPath, checkpointData, "utf8");

      } catch (err) {
        // 静默防崩
      }
    });
  }
}
