import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_MULTI_INSTANCE_CONFIG, type InstanceInfo, type InstanceStatus, type InstanceCreateOptions, type MultiInstanceConfig } from "./types.js";
import { findNextAvailablePort } from "./ports.js";
import { getBaseConfig, createInheritedConfig, writeInstanceConfig } from "./config.js";
import { resolveStateDir } from "../config/paths.js";

export class InstanceManager {
  private config: MultiInstanceConfig;
  private instancesPath: string;

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

  private loadInstances(): InstanceInfo[] {
    const metaPath = this.getInstancesMetaPath();
    if (!fs.existsSync(metaPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(metaPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private saveInstances(instances: InstanceInfo[]): void {
    if (!fs.existsSync(this.instancesPath)) {
      fs.mkdirSync(this.instancesPath, { recursive: true });
    }
    fs.writeFileSync(this.getInstancesMetaPath(), JSON.stringify(instances, null, 2), "utf-8");
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

    instance.status = "running";
    instances[index] = instance;
    this.saveInstances(instances);

    return instances[index];
  }

  stop(name: string): InstanceInfo {
    const instances = this.loadInstances();
    const index = instances.findIndex((inst) => inst.name === name);

    if (index === -1) {
      throw new Error(`Instance "${name}" not found`);
    }

    if (instances[index].status !== "running") {
      throw new Error(`Instance "${name}" is not running`);
    }

    instances[index].status = "stopped";
    this.saveInstances(instances);

    return instances[index];
  }

  delete(name: string, force = false): void {
    const instances = this.loadInstances();
    const index = instances.findIndex((inst) => inst.name === name);

    if (index === -1) {
      throw new Error(`Instance "${name}" not found`);
    }

    const instance = instances[index];

    if (instance.status === "running" && !force) {
      throw new Error(`Instance "${name}" is running. Stop it first or use force flag.`);
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
