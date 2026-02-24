import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_MULTI_INSTANCE_CONFIG, type InstanceInfo, type InstanceCreateOptions, type MultiInstanceConfig, type InstancesRegistry } from "./types.js";
import { findNextAvailablePort } from "./ports.js";
import { getBaseConfig, createInheritedConfig, writeInstanceConfig } from "./config.js";
import {
  spawnProcess,
  isProcessRunning,
  killProcess,
  resolveOpenClawBinary,
  waitForPort,
} from "./process.js";

interface RunningInstance {
  process: ReturnType<typeof spawn> | null;
  info: InstanceInfo;
}

const REGISTRY_VERSION = "1.0";

export class InstanceManager {
  private config: MultiInstanceConfig;
  private instancesPath: string;
  private runningProcesses: Map<string, RunningInstance> = new Map();

  constructor(config: Partial<MultiInstanceConfig> = {}) {
    this.config = { ...DEFAULT_MULTI_INSTANCE_CONFIG, ...config };
    const homeDir = os.homedir();
    this.instancesPath = path.join(homeDir, this.config.instancesDir);
  }

  private getInstancePath(name: string): string {
    return path.join(this.instancesPath, name);
  }

  private getInstancesMetaPath(): string {
    return path.join(this.instancesPath, "instances.json");
  }

  private loadRegistry(): InstancesRegistry {
    const metaPath = this.getInstancesMetaPath();
    if (!fs.existsSync(metaPath)) {
      return {
        version: REGISTRY_VERSION,
        defaultInstance: "main",
        instances: {},
      };
    }
    try {
      const content = fs.readFileSync(metaPath, "utf-8");
      const parsed = JSON.parse(content);
      // Support legacy format (array)
      if (Array.isArray(parsed)) {
        const instances: Record<string, InstanceInfo> = {};
        for (const inst of parsed) {
          instances[inst.name] = inst;
        }
        return {
          version: REGISTRY_VERSION,
          defaultInstance: "main",
          instances,
        };
      }
      return parsed;
    } catch {
      return {
        version: REGISTRY_VERSION,
        defaultInstance: "main",
        instances: {},
      };
    }
  }

  private saveRegistry(registry: InstancesRegistry): void {
    if (!fs.existsSync(this.instancesPath)) {
      fs.mkdirSync(this.instancesPath, { recursive: true });
    }
    fs.writeFileSync(this.getInstancesMetaPath(), JSON.stringify(registry, null, 2), "utf-8");
  }

  // Legacy methods for compatibility
  private loadInstances(): InstanceInfo[] {
    const registry = this.loadRegistry();
    return Object.values(registry.instances);
  }

  private saveInstances(instances: InstanceInfo[]): void {
    const registry = this.loadRegistry();
    for (const inst of instances) {
      registry.instances[inst.name] = inst;
    }
    this.saveRegistry(registry);
  }

  async create(options: InstanceCreateOptions): Promise<InstanceInfo> {
    const { name, gatewayPort, workspaceDir, inheritConfig } = options;

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error("Instance name can only contain letters, numbers, underscores, and hyphens");
    }

    const instances = this.loadInstances();
    if (instances.some((inst) => inst.name === name)) {
      throw new Error(`Instance "${name}" already exists`);
    }

    const instancePath = this.getInstancePath(name);
    if (fs.existsSync(instancePath)) {
      throw new Error(`Instance directory "${instancePath}" already exists`);
    }

    const port = gatewayPort ?? await findNextAvailablePort(this.config, instances);

    const stateDir = path.join(instancePath, "state");
    const configPath = path.join(instancePath, "config", "openclaw.json");
    const workspace = workspaceDir ?? path.join(instancePath, "workspace");

    const { config: baseConfig } = getBaseConfig();
    const instanceConfig = createInheritedConfig(
      baseConfig,
      inheritConfig,
      name,
      stateDir,
      port,
    );

    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });

    writeInstanceConfig(instanceConfig, configPath);

    const instanceInfo: InstanceInfo = {
      name,
      stateDir,
      configPath,
      workspaceDir: workspace,
      gatewayPort: port,
      createdAt: new Date().toISOString(),
      status: "stopped",
    };

    instances.push(instanceInfo);
    this.saveInstances(instances);

    return instanceInfo;
  }

  list(): InstanceInfo[] {
    return this.loadInstances();
  }

  get(name: string): InstanceInfo | undefined {
    const instances = this.loadInstances();
    return instances.find((inst) => inst.name === name);
  }

  async start(name: string): Promise<InstanceInfo> {
    const instances = this.loadInstances();
    const index = instances.findIndex((inst) => inst.name === name);

    if (index === -1) {
      throw new Error(`Instance "${name}" not found`);
    }

    const instance = instances[index];

    if (instance.status === "running") {
      throw new Error(`Instance "${name}" is already running`);
    }

    instance.status = "starting";
    instance.lastStartedAt = new Date().toISOString();
    instances[index] = instance;
    this.saveInstances(instances);

    try {
      const result = await this.spawnInstance(instance);
      instance.pid = result.pid;
      instance.status = "running";
      instances[index] = instance;
      this.saveInstances(instances);
    } catch (error) {
      instance.status = "error";
      instances[index] = instance;
      this.saveInstances(instances);
      throw error;
    }

    return instances[index];
  }

  async spawnInstance(instance: InstanceInfo): Promise<{ pid: number }> {
    const env = this.getEnvForInstance(instance.name);
    const binary = resolveOpenClawBinary();

    const { pid, process: childProcess } = spawnProcess({
      command: binary,
      args: ["gateway", "run"],
      env,
      cwd: instance.workspaceDir,
      detached: true,
    });

    this.runningProcesses.set(instance.name, {
      process: childProcess,
      info: instance,
    });

    const portReady = await waitForPort(instance.gatewayPort, 30000);
    if (!portReady) {
      this.runningProcesses.delete(instance.name);
      throw new Error(`Instance "${instance.name}" failed to start: port ${instance.gatewayPort} not ready`);
    }

    return { pid };
  }

  async stopInstance(name: string, force = false): Promise<InstanceInfo> {
    const instances = this.loadInstances();
    const index = instances.findIndex((inst) => inst.name === name);

    if (index === -1) {
      throw new Error(`Instance "${name}" not found`);
    }

    const instance = instances[index];

    if (instance.status !== "running" && instance.status !== "starting") {
      throw new Error(`Instance "${name}" is not running`);
    }

    const runningInstance = this.runningProcesses.get(name);

    if (instance.pid && isProcessRunning(instance.pid)) {
      const killed = await killProcess(
        instance.pid,
        force ? "SIGKILL" : "SIGTERM",
        force ? 0 : 10000,
      );

      if (!killed && !force) {
        throw new Error(`Failed to stop instance "${name}" gracefully, use force flag`);
      }
    }

    if (runningInstance?.process) {
      try {
        runningInstance.process.kill("SIGTERM");
      } catch {
        // Process already dead
      }
      this.runningProcesses.delete(name);
    }

    instance.status = "stopped";
    instance.pid = undefined;
    instances[index] = instance;
    this.saveInstances(instances);

    return instance;
  }

  getInstanceStatus(name: string): { running: boolean; pid?: number; port?: number } {
    const instance = this.get(name);

    if (!instance) {
      return { running: false };
    }

    if (instance.pid && isProcessRunning(instance.pid)) {
      return {
        running: true,
        pid: instance.pid,
        port: instance.gatewayPort,
      };
    }

    if (instance.status === "running") {
      const instances = this.loadInstances();
      const index = instances.findIndex((inst) => inst.name === name);
      if (index !== -1) {
        instances[index].status = "stopped";
        instances[index].pid = undefined;
        this.saveInstances(instances);
      }
    }

    return { running: false };
  }

  listInstanceStatuses(): Map<string, { running: boolean; pid?: number; port?: number }> {
    const instances = this.loadInstances();
    const statuses = new Map<string, { running: boolean; pid?: number; port?: number }>();

    for (const instance of instances) {
      const status = this.getInstanceStatus(instance.name);
      statuses.set(instance.name, status);
    }

    return statuses;
  }

  stop(name: string): InstanceInfo {
    return this.stopInstance(name, false);
  }

  delete(name: string, force = false): void {
    const instances = this.loadInstances();
    const index = instances.findIndex((inst) => inst.name === name);

    if (index === -1) {
      throw new Error(`Instance "${name}" not found`);
    }

    const instance = instances[index];

    if (instance.status === "running" || instance.status === "starting") {
      if (!force) {
        throw new Error(`Instance "${name}" is running. Stop it first or use force flag.`);
      }
      this.stopInstance(name, true);
    }

    const instancePath = this.getInstancePath(name);
    if (fs.existsSync(instancePath)) {
      fs.rmSync(instancePath, { recursive: true, force: true });
    }

    instances.splice(index, 1);
    this.saveInstances(instances);
  }

  getConfigPath(name: string): string | undefined {
    const instance = this.get(name);
    return instance?.configPath;
  }

  getEnvForInstance(name: string): Record<string, string> {
    const instance = this.get(name);
    if (!instance) {
      throw new Error(`Instance "${name}" not found`);
    }

    return {
      OPENCLAW_STATE_DIR: instance.stateDir,
      OPENCLAW_CONFIG_PATH: instance.configPath,
      OPENCLAW_GATEWAY_PORT: String(instance.gatewayPort),
      OPENCLAW_INSTANCE: name,
    };
  }

  /**
   * Switch the default instance
   */
  switchInstance(name: string): InstanceInfo {
    const registry = this.loadRegistry();
    if (!registry.instances[name]) {
      throw new Error(`Instance "${name}" not found`);
    }
    registry.defaultInstance = name;
    this.saveRegistry(registry);
    return registry.instances[name];
  }

  /**
   * Get the current default instance
   */
  getCurrentInstance(): InstanceInfo | undefined {
    const registry = this.loadRegistry();
    return registry.instances[registry.defaultInstance];
  }

  /**
   * Get the default instance name
   */
  getDefaultInstanceName(): string {
    const registry = this.loadRegistry();
    return registry.defaultInstance;
  }

  /**
   * Get registry info
   */
  getRegistry(): InstancesRegistry {
    return this.loadRegistry();
  }
}

let instanceManager: InstanceManager | null = null;

export function getInstanceManager(config?: Partial<MultiInstanceConfig>): InstanceManager {
  if (!instanceManager) {
    instanceManager = new InstanceManager(config);
  }
  return instanceManager;
}

export function resetInstanceManager(): void {
  instanceManager = null;
}
