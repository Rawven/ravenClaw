import type { InstanceInfo } from "./types.js";
import type { MultiInstanceConfig } from "./types.js";
import net from "node:net";

export async function findAvailablePort(
  config: MultiInstanceConfig,
  usedPorts: number[],
): Promise<number> {
  const { portRangeStart, portRangeEnd, defaultGatewayPort } = config;

  const allUsedPorts = new Set([defaultGatewayPort, ...usedPorts]);

  for (let port = portRangeStart; port <= portRangeEnd; port++) {
    if (!allUsedPorts.has(port) && await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available ports in range ${portRangeStart}-${portRangeEnd}`,
  );
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export function getUsedPorts(instances: InstanceInfo[]): number[] {
  return instances.map((inst) => inst.gatewayPort).filter((p): p is number => p > 0);
}

export async function findNextAvailablePort(
  config: MultiInstanceConfig,
  instances: InstanceInfo[],
): Promise<number> {
  const usedPorts = getUsedPorts(instances);
  return findAvailablePort(config, usedPorts);
}
