# OpenClaw 多实例技术方案

## 1. 核心数据结构

### 1.1 实例注册表 (instances.json)

```json
{
  "version": "1.0",
  "defaultInstance": "main",
  "instances": {
    "main": {
      "name": "main",
      "configPath": "/root/.openclaw/instances/main/config",
      "stateDir": "/root/.openclaw/instances/main/state",
      "workspace": "/root/.openclaw/instances/main/workspace",
      "createdAt": "2026-02-24T00:00:00Z",
      "lastActiveAt": "2026-02-24T02:00:00Z"
    },
    "dev": {
      "name": "dev",
      "configPath": "/root/.openclaw/instances/dev/config",
      "stateDir": "/root/.openclaw/instances/dev/state",
      "workspace": "/root/.openclaw/instances/dev/workspace",
      "createdAt": "2026-02-24T01:00:00Z"
    }
  }
}
```

### 1.2 实例配置 (instances/{name}/config/openclaw.json)

```json
{
  "instance": {
    "name": "dev",
    "parentConfig": "/root/.openclaw/openclaw.json"
  },
  "agents": {
    "defaults": {
      "workspace": "/root/.openclaw/instances/dev/workspace"
    }
  }
}
```

---

## 2. 目录结构

```
~/.openclaw/
├── openclaw.json              # 基础配置
├── skills/                    # 共享技能
├── instances/
│   ├── instances.json         # 注册表
│   ├── main/
│   │   ├── config/openclaw.json
│   │   ├── state/
│   │   │   └── agents/
│   │   │       └── sessions/
│   │   └── workspace/
│   │       ├── SOUL.md
│   │       └── MEMORY.md
│   └── dev/
│       ├── config/openclaw.json
│       ├── state/agents/sessions/
│       └── workspace/SOUL.md
```

---

## 3. 核心模块设计

### 3.1 InstanceManager 类

```typescript
// src/multi-instance/manager.ts

import fs from 'fs/promises';
import path from 'path';

const INSTANCES_REGISTRY = path.join(process.env.OPENCLAW_HOME || '~/.openclaw', 'instances.json');

export interface InstanceInfo {
  name: string;
  configPath: string;
  stateDir: string;
  workspace: string;
  createdAt: string;
  lastActiveAt?: string;
}

export interface InstancesRegistry {
  version: string;
  defaultInstance: string;
  instances: Record<string, InstanceInfo>;
}

export class InstanceManager {
  
  // 加载注册表
  async loadRegistry(): Promise<InstancesRegistry> {
    const content = await fs.readFile(INSTANCES_REGISTRY, 'utf-8');
    return JSON.parse(content);
  }
  
  // 保存注册表
  async saveRegistry(registry: InstancesRegistry): Promise<void> {
    await fs.writeFile(INSTANCES_REGISTRY, JSON.stringify(registry, null, 2));
  }
  
  // 创建实例
  async createInstance(name: string): Promise<InstanceInfo> {
    const baseDir = path.join(process.env.OPENCLAW_HOME!, 'instances', name);
    
    // 创建目录
    await fs.mkdir(path.join(baseDir, 'config'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'state', 'agents', 'sessions'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'workspace'), { recursive: true });
    
    // 创建实例配置
    const instanceConfig = {
      instance: {
        name,
        parentConfig: path.join(process.env.OPENCLAW_HOME!, 'openclaw.json')
      },
      agents: {
        defaults: {
          workspace: path.join(baseDir, 'workspace')
        }
      }
    };
    await fs.writeFile(
      path.join(baseDir, 'config', 'openclaw.json'),
      JSON.stringify(instanceConfig, null, 2)
    );
    
    // 创建默认 SOUL.md
    await fs.writeFile(
      path.join(baseDir, 'workspace', 'SOUL.md'),
      `# SOUL.md - ${name} Instance\n\nCreated: ${new Date().toISOString()}\n`
    );
    
    // 注册到注册表
    const registry = await this.loadRegistry();
    registry.instances[name] = {
      name,
      configPath: path.join(baseDir, 'config'),
      stateDir: path.join(baseDir, 'state'),
      workspace: path.join(baseDir, 'workspace'),
      createdAt: new Date().toISOString()
    };
    await this.saveRegistry(registry);
    
    return registry.instances[name];
  }
  
  // 删除实例
  async deleteInstance(name: string): Promise<void> {
    const registry = await this.loadRegistry();
    const instance = registry.instances[name];
    
    if (!instance) {
      throw new Error(`Instance ${name} not found`);
    }
    
    // 删除目录
    const baseDir = path.dirname(instance.configPath);
    await fs.rm(baseDir, { recursive: true, force: true });
    
    // 从注册表移除
    delete registry.instances[name];
    if (registry.defaultInstance === name) {
      registry.defaultInstance = Object.keys(registry.instances)[0] || 'main';
    }
    await this.saveRegistry(registry);
  }
  
  // 列出所有实例
  async listInstances(): Promise<InstanceInfo[]> {
    const registry = await this.loadRegistry();
    return Object.values(registry.instances);
  }
  
  // 获取当前实例
  async getCurrentInstance(): Promise<InstanceInfo> {
    const registry = await this.loadRegistry();
    return registry.instances[registry.defaultInstance];
  }
  
  // 切换默认实例
  async switchInstance(name: string): Promise<void> {
    const registry = await this.loadRegistry();
    if (!registry.instances[name]) {
      throw new Error(`Instance ${name} not found`);
    }
    registry.defaultInstance = name;
    await this.saveRegistry(registry);
  }
}
```

### 3.2 实例路由中间件

```typescript
// src/gateway/middleware/instance-router.ts

import { InstanceManager } from '../multi-instance/manager';

const instanceManager = new InstanceManager();

export async function instanceMiddleware(req, res, next) {
  // 从 Header 获取实例名
  const instanceName = req.headers['x-openclaw-instance'] 
                   || req.query.instance 
                   || (await instanceManager.getCurrentInstance()).name;
  
  // 加载实例信息
  const registry = await instanceManager.loadRegistry();
  const instance = registry.instances[instanceName];
  
  if (!instance) {
    return res.status(404).json({ error: `Instance ${instanceName} not found` });
  }
  
  // 设置上下文
  req.instanceContext = {
    name: instance.name,
    workspace: instance.workspace,
    stateDir: instance.stateDir,
    configPath: instance.configPath
  };
  
  // 更新最后活跃时间
  instance.lastActiveAt = new Date().toISOString();
  await instanceManager.saveRegistry(registry);
  
  next();
}
```

### 3.3 Session 隔离

```typescript
// src/agents/sessions/index.ts

import path from 'path';

export function getSessionPath(instanceContext, sessionId: string): string {
  // 根据实例上下文决定 session 存储路径
  const sessionsDir = path.join(instanceContext.stateDir, 'agents', 'sessions');
  return path.join(sessionsDir, `${sessionId}.jsonl`);
}

export function loadSession(instanceContext, sessionId: string) {
  const sessionPath = getSessionPath(instanceContext, sessionId);
  // 读取该实例的 session 文件
}
```

### 3.4 SOUL.md 隔离加载

```typescript
// src/agents/llm.ts

import path from 'path';
import fs from 'fs/promises';

export async function loadSoulForInstance(instanceContext) {
  const soulPath = path.join(instanceContext.workspace, 'SOUL.md');
  try {
    return await fs.readFile(soulPath, 'utf-8');
  } catch {
    // 如果不存在，返回默认
    return '# Default Soul\n';
  }
}
```

---

## 4. CLI 命令实现

### 4.1 instance create

```typescript
// src/cli/commands/instance/create.ts

import { InstanceManager } from '../../multi-instance/manager';

export async function createInstanceCommand(name: string) {
  const manager = new InstanceManager();
  
  console.log(`Creating instance "${name}"...`);
  const instance = await manager.createInstance(name);
  console.log(`✅ Instance "${name}" created at ${instance.workspace}`);
}
```

### 4.2 instance list

```typescript
// src/cli/commands/instance/list.ts

import { InstanceManager } from '../../multi-instance/manager';

export async function listInstancesCommand() {
  const manager = new InstanceManager();
  const instances = await manager.listInstances();
  const current = await manager.getCurrentInstance();
  
  console.log('Instances:');
  for (const inst of instances) {
    const marker = inst.name === current.name ? ' *' : '';
    console.log(`  - ${inst.name}${marker}`);
    console.log(`    Workspace: ${inst.workspace}`);
    console.log(`    Created: ${inst.createdAt}`);
  }
}
```

### 4.3 instance switch

```typescript
// src/cli/commands/instance/switch.ts

import { InstanceManager } from '../../multi-instance/manager';

export async function switchInstanceCommand(name: string) {
  const manager = new InstanceManager();
  await manager.switchInstance(name);
  console.log(`✅ Switched to instance "${name}"`);
}
```

---

## 5. API 接口

### 5.1 HTTP API

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/instances | 列出所有实例 |
| POST | /api/instances | 创建实例 |
| GET | /api/instances/:name | 获取实例信息 |
| DELETE | /api/instances/:name | 删除实例 |
| PUT | /api/instances/:name/switch | 切换默认实例 |

### 5.2 请求 Header

```bash
# 指定实例
curl -H "X-OpenClaw-Instance: dev" http://localhost:18789/chat

# 默认实例
curl http://localhost:18789/chat
```

---

## 6. 测试用例

### 6.1 功能测试

```typescript
describe('InstanceManager', () => {
  test('createInstance creates directory structure', async () => {
    const manager = new InstanceManager();
    const instance = await manager.createInstance('test');
    
    expect(instance.name).toBe('test');
    expect(instance.workspace).toContain('test');
  });
  
  test('listInstances returns all instances', async () => {
    const manager = new InstanceManager();
    const instances = await manager.listInstances();
    expect(instances.length).toBeGreaterThan(0);
  });
});
```

### 6.2 隔离测试

```typescript
describe('Instance Isolation', () => {
  test('sessions are isolated between instances', async () => {
    // 实例 A 创建 session
    // 实例 B 创建 session
    // 验证两者不互通
  });
  
  test('SOUL.md is loaded per instance', async () => {
    // 实例 A 设置 SOUL.md
    // 实例 B 设置不同的 SOUL.md
    // 验证加载的是各自的
  });
});
```

---

## 7. 实施步骤

### Step 1: 基础功能 (1天)
1. 创建 instances.json 注册表
2. 实现 InstanceManager 核心方法
3. 实现 CLI create/list/delete 命令

### Step 2: 路由隔离 (2天)
1. 实现实例路由中间件
2. 修改 session 存储路径
3. 修改 SOUL.md 加载逻辑

### Step 3: 测试与完善 (1天)
1. 编写测试用例
2. 修复 bug
3. 飞书集成
