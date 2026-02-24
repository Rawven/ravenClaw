import fs from "node:fs";
import path from "node:path";
import { resolveStateDir, resolveConfigPath, DEFAULT_GATEWAY_PORT } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.base.js";
import { loadConfig } from "../config/io.js";

export interface InheritedConfigResult {
  config: OpenClawConfig;
  sourceConfigPath: string;
}

export function getBaseConfig(): InheritedConfigResult {
  const stateDir = resolveStateDir();
  const configPath = resolveConfigPath();

  if (fs.existsSync(configPath)) {
    const config = loadConfig(configPath);
    return { config, sourceConfigPath: configPath };
  }

  return {
    config: {
      gateway: { port: DEFAULT_GATEWAY_PORT },
    },
    sourceConfigPath: configPath,
  };
}

export function createInheritedConfig(
  baseConfig: OpenClawConfig,
  overrides: Partial<OpenClawConfig>,
  instanceName: string,
  instanceStateDir: string,
  instancePort: number,
): OpenClawConfig {
  const inherited: OpenClawConfig = JSON.parse(JSON.stringify(baseConfig));

  inherited.instance = {
    name: instanceName,
    parentConfig: true,
  };

  if (inherited.gateway) {
    inherited.gateway.port = instancePort;
  } else {
    inherited.gateway = { port: instancePort };
  }

  if (inherited.agents?.defaults) {
    if (!inherited.agents.defaults.workspace) {
      inherited.agents.defaults.workspace = path.join(instanceStateDir, "workspace");
    }
  } else if (inherited.agents) {
    inherited.agents.defaults = { workspace: path.join(instanceStateDir, "workspace") };
  } else {
    inherited.agents = {
      defaults: { workspace: path.join(instanceStateDir, "workspace") },
    };
  }

  if (overrides) {
    Object.assign(inherited, deepMerge(inherited, overrides));
  }

  return inherited;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key as keyof T];
    const targetValue = target[key as keyof T];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key as keyof T] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }

  return result;
}

export function writeInstanceConfig(
  config: OpenClawConfig,
  configPath: string,
): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, content, "utf-8");
}
