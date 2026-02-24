# RavenClaw Rust 重构计划

## 目标

将 RavenClaw 从 TypeScript 重构为 Rust，减少内存占用和提高性能。

## 当前状态

- TypeScript 文件: 3,692 个
- 代码行数: 658K 行
- 当前内存: ~600MB

---

## TODO List

### Phase 0: 简化当前版本 (立即可做)

- [ ] 1. 禁用所有非 feishu channels
- [ ] 2. 清理未使用的 skills
- [ ] 3. 验证内存减少效果

### Phase 1: 核心架构设计

- [ ] 1. 设计 Rust 核心模块结构
- [ ] 2. 定义消息处理接口
- [ ] 3. 设计 Channel 抽象层

### Phase 2: 核心模块 (Rust)

- [ ] 1. Gateway 主进程 (Rust)
- [ ] 2. Session 管理
- [ ] 3. 配置加载
- [ ] 4. 消息路由

### Phase 3: Channel 层

- [ ] 1. Feishu SDK (Rust)
- [ ] 2. 消息接收/发送
- [ ] 3. 事件处理

### Phase 4: Agent 集成

- [ ] 1. LLM 提供商对接
- [ ] 2. Tool 执行框架
- [ ] 3. 会话状态管理

### Phase 5: 迁移

- [ ] 1. 数据迁移脚本
- [ ] 2. 兼容性测试
- [ ] 3. 灰度发布

---

## 预期效果

| 指标 | 当前  | 目标  | 改善 |
| ---- | ----- | ----- | ---- |
| 内存 | 600MB | 100MB | -83% |
| 启动 | 30s   | 3s    | -90% |
