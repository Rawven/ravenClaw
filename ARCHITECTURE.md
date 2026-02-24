# OpenClaw 架构文档

## 1. 项目概述

**OpenClaw** - 运行在用户自有设备上的个人 AI 助手。

### 核心理念
- **Personal** - 个人专属，非共享
- **Local** - 本地运行，保护隐私
- **Always-on** - 持续在线
- **Multichannel** - 多渠道支持

### 支持的渠道
- WhatsApp, Telegram, Slack, Discord, Google Chat, Signal
- iMessage, Microsoft Teams, BlueBubbles, Matrix, Zalo
- 飞书 (Feishu), WebChat

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────┐
│              OpenClaw Gateway                   │
│         (控制平面 Control Plane)              │
├─────────────────────────────────────────────────────┤
│  CLI  │  Web UI  │  API  │  WebSocket       │
├─────────────────────────────────────────────────────┤
│              Session Manager                    │
│         (会话管理 + 状态持久化)               │
├─────────────────────────────────────────────────────┤
│  Memory  │  Hooks  │  Cron  │  Plugins       │
├─────────────────────────────────────────────────────┤
│              Tool Executor                     │
│    (工具执行: exec, read, write, message...)  │
├─────────────────────────────────────────────────────┤
│           Model Provider Layer                 │
│    (Anthropic, OpenAI, Google, MiniMax...)    │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心模块 (src/)

| 目录 | 功能 |
|------|------|
| `gateway/` | Gateway 主服务 (WebSocket API) |
| `agents/` | Agent 会话管理 |
| `sessions/` | 会话状态管理 |
| `memory/` | 记忆系统 |
| `cron/` | 定时任务 |
| `hooks/` | 生命周期钩子 |
| `commands/` | CLI 命令 |
| `config/` | 配置管理 |
| `providers/` | LLM 模型提供商 |
| `channels/` | 消息通道核心逻辑 |
| `routing/` | 消息路由 |
| `plugins/` | 插件系统 |
| `skills/` | 内置技能 |
| `tts/` | 语音合成 |
| `browser/` | 浏览器控制 |
| `media/` | 媒体处理 |

---

## 4. 消息通道

### 内置通道 (src/)
- `telegram/` - Telegram
- `discord/` - Discord
- `slack/` - Slack
- `signal/` - Signal
- `imessage/` - iMessage (macOS)
- `whatsapp/` - WhatsApp
- `line/` - LINE

### 扩展通道 (extensions/)
- `feishu/` - 飞书
- `msteams/` - Microsoft Teams
- `matrix/` - Matrix
- `zalo/` - Zalo
- `voice-call/` - 语音通话

---

## 5. 工作流程

```
用户消息
    │
    ▼
┌─────────────────┐
│  Channel Input  │ ─── 接收消息
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Routing      │ ─── 消息路由 + 权限检查
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Session      │ ─── 获取/创建会话 + 记忆
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   LLM Provider  │ ─── 调用模型
└────────┬────────┘
         │
    ┌────┴────┐
    │          │
 ▼ ▼          ▼
Tool        Tool
Exec       Exec
    │          │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│  Channel Output │ ─── 返回消息
└─────────────────┘
```

---

## 6. 配置结构

```json
{
  "gateway": {
    "port": 18789,
    "bind": "127.0.0.1"
  },
  "agents": {
    "defaults": {
      "model": "claude-3-5-sonnet-20241022",
      "maxTokens": 100000
    }
  },
  "channels": {
    "feishu": { ... }
  },
  "skills": { ... },
  "memory": { ... }
}
```

---

## 7. 技能系统 (Skills)

### 内置技能 (src/skills/)
- `exec` - 执行命令
- `read/write` - 文件操作
- `message` - 发送消息
- `browser` - 浏览器控制
- `tts` - 语音合成

### 外部技能 (workspace/skills/)
- 从 ClawHub 安装
- MCP 服务器集成
- 自定义技能

---

## 8. 记忆系统

OpenClaw 使用文件基础的记忆：
- `MEMORY.md` - 长期记忆
- `SOUL.md` - 角色/人格定义
- `USER.md` - 用户信息
- `memory/YYYY-MM-DD.md` - 每日日志

---

## 9. 扩展点

### Plugins
- 通道插件
- 记忆插件
- Provider 插件

### MCP (Model Context Protocol)
- 通过 `mcporter` 集成
- 动态添加 MCP 服务器

### Hooks
- `onMessage` - 消息钩子
- `onTool` - 工具执行钩子
- `onAgentTurn` - Agent 轮次钩子

---

## 10. 部署方式

### 推荐
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### Docker
```bash
docker run -v ~/.openclaw:/root/.openclaw openclaw/openclaw
```

### 从源码
```bash
git clone https://github.com/openclaw/openclaw.git
pnpm install
pnpm build
```

---

## 11. 相关项目

| 项目 | 说明 |
|------|------|
| ClawHub | 技能市场 |
| mcporter | MCP 集成工具 |
| openclaw.ai | 官网 |
| docs.openclaw.ai | 文档 |

---

*文档生成时间: 2026-02-24*
*来源: OpenClaw GitHub 仓库*
