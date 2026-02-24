import type { OpenClawConfig } from "../config/types.base.js";

export interface InstanceInfo {
  name: string;
  stateDir: string;
  configPath: string;
  workspaceDir: string;
  gatewayPort: number;
  createdAt: string;
  lastStartedAt?: string;
  pid?: number;
  status: InstanceStatus;
}

export type InstanceStatus = "stopped" | "running" | "starting" | "error";

export interface InstanceCreateOptions {
  name: string;
  gatewayPort?: number;
  workspaceDir?: string;
  inheritConfig?: Partial<OpenClawConfig>;
}

export interface InstanceListOptions {
  includeStatus?: boolean;
}

export interface InstanceStartOptions {
  force?: boolean;
}

export interface MultiInstanceConfig {
  instancesDir: string;
  defaultGatewayPort: number;
  portRangeStart: number;
  portRangeEnd: number;
  defaultInstance?: string;
}

export interface InstancesRegistry {
  version: string;
  defaultInstance: string;
  instances: Record<string, InstanceInfo>;
}

export const DEFAULT_MULTI_INSTANCE_CONFIG: MultiInstanceConfig = {
  instancesDir: ".openclaw-instances",
  defaultGatewayPort: 18789,
  portRangeStart: 18790,
  portRangeEnd: 18889,
};
