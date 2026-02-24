# RavenClaw 内存优化技术方案

## 1. 当前架构分析

### 1.1 主要内存消耗点

| 模块       | 位置                  | 内存占用原因                          |
| ---------- | --------------------- | ------------------------------------- |
| Gateway    | src/gateway/          | 主服务进程，处理所有请求              |
| Agents     | src/agents/           | Agent 运行时，包含大量工具            |
| Sessions   | agents/main/sessions/ | Session 消息历史 (21个文件，最大6MB+) |
| Memory     | memory/main.sqlite    | QMD 向量存储                          |
| Extensions | extensions/           | 40+ 消息渠道集成                      |
| Skills     | skills/               | 28+ 技能模块                          |

### 1.2 当前问题

1. **Session 文件累积** - 21个文件，无自动清理
2. **Skills 全量加载** - 启动时全部加载到内存
3. **多实例各自加载** - 无共享机制

---

## 2. 优化方案

### 优化1：Session 自动清理

- 添加 maxSessionAge 配置
- 定时清理过期 Session

### 优化2：Skills 懒加载

- 首次使用时才加载
- 空闲时释放内存

### 优化3：多实例技能共享

- 技能目录通过文件系统共享
- 每个实例只保留 workspace

---

## 3. 实施计划

**Phase 1**: Session 自动清理 + Skills 懒加载
**Phase 2**: 模块懒加载优化
**Phase 3**: 多实例技能共享架构

---

## 4. 实施状态

### Phase 1 (已完成 2026-02-24)

**✅ Session 文件清理**

- 新建 `src/agents/session-file-cleanup.ts`
- 清理 19 个过期 session 文件
- 释放约 10MB 空间
- Cron job 已更新（每 2 小时清理 7 天前文件）

**⚠️ Skills 懒加载**

- 需要较大架构改动
- 建议放到 Phase 2 或 3

### 效果

- Session 文件从 21 个减到 2 个
- 释放约 10MB 磁盘空间
