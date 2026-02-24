/**
 * Instance Routing Middleware
 * 
 * This middleware handles routing requests to the correct instance based on:
 * - HTTP header: X-OpenClaw-Instance
 * - Query parameter: instance
 * - Environment variable: OPENCLAW_INSTANCE
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { getInstanceManager, type InstanceInfo } from "./manager.js";

export interface InstanceContext {
  instance: InstanceInfo;
  instanceName: string;
}

declare module "fastify" {
  interface FastifyRequest {
    instanceContext?: InstanceContext;
  }
}

/**
 * Extract instance name from request
 */
export function extractInstanceName(req: FastifyRequest): string | undefined {
  // 1. Check header
  const headerInstance = req.headers["x-openclaw-instance"] as string | undefined;
  if (headerInstance) {
    return headerInstance;
  }

  // 2. Check query parameter
  const queryInstance = req.query.instance as string | undefined;
  if (queryInstance) {
    return queryInstance;
  }

  // 3. Check environment variable (set by gateway)
  const envInstance = process.env.OPENCLAW_INSTANCE;
  if (envInstance) {
    return envInstance;
  }

  return undefined;
}

/**
 * Instance routing middleware
 * Attaches instance context to request if instance is specified
 */
export async function instanceRoutingMiddleware(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  const instanceName = extractInstanceName(req);

  if (!instanceName) {
    // No instance specified, use default
    const manager = getInstanceManager();
    const defaultInstance = manager.getCurrentInstance();
    if (defaultInstance) {
      req.instanceContext = {
        instance: defaultInstance,
        instanceName: defaultInstance.name,
      };
    }
    return;
  }

  const manager = getInstanceManager();
  const instance = manager.get(instanceName);

  if (!instance) {
    res.status(404).send({
      error: "InstanceNotFound",
      message: `Instance "${instanceName}" not found`,
    });
    return;
  }

  req.instanceContext = {
    instance,
    instanceName: instance.name,
  };
}

/**
 * Require instance middleware
 * Ensures a valid instance is specified in the request
 */
export async function requireInstanceMiddleware(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  const instanceName = extractInstanceName(req);

  if (!instanceName) {
    res.status(400).send({
      error: "InstanceRequired",
      message: "Instance must be specified via X-OpenClaw-Instance header, query parameter, or environment",
    });
    return;
  }

  const manager = getInstanceManager();
  const instance = manager.get(instanceName);

  if (!instance) {
    res.status(404).send({
      error: "InstanceNotFound",
      message: `Instance "${instanceName}" not found`,
    });
    return;
  }

  if (instance.status !== "running") {
    res.status(400).send({
      error: "InstanceNotRunning",
      message: `Instance "${instanceName}" is not running`,
    });
    return;
  }

  req.instanceContext = {
    instance,
    instanceName: instance.name,
  };
}

/**
 * Get instance config path for the current request
 */
export function getInstanceConfigPath(req: FastifyRequest): string | undefined {
  return req.instanceContext?.instance.configPath;
}

/**
 * Get instance state directory for the current request
 */
export function getInstanceStateDir(req: FastifyRequest): string | undefined {
  return req.instanceContext?.instance.stateDir;
}

/**
 * Get instance workspace for the current request
 */
export function getInstanceWorkspace(req: FastifyRequest): string | undefined {
  return req.instanceContext?.instance.workspaceDir;
}
