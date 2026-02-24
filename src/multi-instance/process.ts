import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface ProcessOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  detached?: boolean;
}

export interface ProcessResult {
  pid: number;
  process: ChildProcess;
}

export function spawnProcess(options: ProcessOptions): ProcessResult {
  const { command, args = [], env = {}, cwd = process.cwd(), detached = false } = options;

  const childEnv = { ...process.env, ...env };

  const childProcess = spawn(command, args, {
    env: childEnv,
    cwd,
    detached,
    stdio: detached ? "ignore" : "inherit",
  });

  if (detached) {
    childProcess.unref();
  }

  return {
    pid: childProcess.pid ?? 0,
    process: childProcess,
  };
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killProcess(
  pid: number,
  signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      process.kill(pid, signal);
    } catch {
      resolve(true);
      return;
    }

    if (signal === "SIGKILL") {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (!isProcessRunning(pid)) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Process already gone
        }
        resolve(false);
      }
    }, 100);
  });
}

export function getProcessInfo(pid: number): {
  pid: number;
  ppid: number;
  memory: number;
  cpu: number;
} | null {
  try {
    const ps = require("node:child_process").spawnSync(
      os.platform() === "win32" ? "wmic" : "ps",
      os.platform() === "win32"
        ? ["process", "get", "ProcessId,ParentProcessId,WorkingSetSize", `/filter:ProcessId=${pid}`]
        : ["-p", pid, "-o", "ppid=", "rss="],
      { encoding: "utf-8" },
    );

    if (ps.error || !ps.stdout) {
      return null;
    }

    if (os.platform() === "win32") {
      const lines = ps.stdout.trim().split("\n");
      if (lines.length < 2) {
        return null;
      }

      const parts = lines[1].trim().split(/\s+/);
      return {
        pid,
        ppid: parseInt(parts[1]) || 0,
        memory: parseInt(parts[2]) || 0,
        cpu: 0,
      };
    } else {
      const lines = ps.stdout.trim().split("\n");
      if (lines.length < 2) {
        return null;
      }

      return {
        pid,
        ppid: parseInt(lines[0]) || 0,
        memory: parseInt(lines[1]) || 0,
        cpu: 0,
      };
    }
  } catch {
    return null;
  }
}

export function findOpenClawProcesses(): { pid: number; port?: number }[] {
  const processes: { pid: number; port?: number }[] = [];

  try {
    const ps = require("node:child_process").spawnSync(
      os.platform() === "win32" ? "tasklist" : "pgrep",
      os.platform() === "win32" ? ["/FI", "IMAGENAME eq node.exe"] : ["-f", "openclaw"],
      { encoding: "utf-8" },
    );

    if (ps.error || !ps.stdout) {
      return processes;
    }

    const lines = ps.stdout.trim().split("\n");
    for (const line of lines) {
      if (os.platform() === "win32") {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === "node.exe" && parts.length > 1) {
          processes.push({ pid: parseInt(parts[1]) });
        }
      } else {
        const match = line.match(/^\s*(\d+)/);
        if (match) {
          processes.push({ pid: parseInt(match[1]) });
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return processes;
}

export function resolveOpenClawBinary(): string {
  const homeDir = os.homedir();
  const pnpmBin = path.join(homeDir, "Library", "pnpm");
  const npmGlobalBin = path.join(homeDir, ".npm-global", "bin");

  const candidates = [
    process.execPath,
    path.join(pnpmBin, "openclaw"),
    path.join(npmGlobalBin, "openclaw"),
    "openclaw",
  ];

  for (const candidate of candidates) {
    try {
      if (candidate === process.execPath || fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return "openclaw";
}

export async function waitForPort(
  port: number,
  timeoutMs = 30000,
  host = "127.0.0.1",
): Promise<boolean> {
  const net = require("node:net");

  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkPort = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        socket.destroy();
        retry();
      });

      socket.on("error", () => {
        socket.destroy();
        retry();
      });

      socket.connect(port, host);
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(checkPort, 500);
      }
    };

    checkPort();
  });
}
