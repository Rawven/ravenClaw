import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { getInstanceManager, type InstanceInfo } from "../multi-instance/manager.js";
import { type InstanceCreateOptions } from "../multi-instance/types.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";

interface InstanceCreateCommandOptions {
  port?: string;
  workspace?: string;
}

interface InstanceListCommandOptions {
  json?: boolean;
  status?: boolean;
}

interface InstanceStartCommandOptions {
  background?: boolean;
  watch?: boolean;
}

interface InstanceStopCommandOptions {
  force?: boolean;
}

interface InstanceDeleteCommandOptions {
  force?: boolean;
  keepWorkspace?: boolean;
}

interface InstanceStatusCommandOptions {
  json?: boolean;
  deep?: boolean;
}

interface InstanceLogsCommandOptions {
  lines?: string;
  follow?: boolean;
  since?: string;
  until?: string;
}

function formatInstanceInfo(instance: InstanceInfo, includeStatus = false): string {
  const lines = [
    `${theme.label("Name:")} ${instance.name}`,
    `${theme.label("State Dir:")} ${shortenHomePath(instance.stateDir)}`,
    `${theme.label("Config:")} ${shortenHomePath(instance.configPath)}`,
    `${theme.label("Workspace:")} ${shortenHomePath(instance.workspaceDir)}`,
    `${theme.label("Port:")} ${instance.gatewayPort}`,
    `${theme.label("Created:")} ${instance.createdAt}`,
  ];

  if (includeStatus) {
    lines.push(`${theme.label("Status:")} ${instance.status}`);
    if (instance.lastStartedAt) {
      lines.push(`${theme.label("Last Started:")} ${instance.lastStartedAt}`);
    }
  }

  return lines.join("\n");
}

function getInstanceStatusColor(status: string): string {
  switch (status) {
    case "running":
      return theme.success(status);
    case "starting":
      return theme.warn(status);
    case "error":
      return theme.error(status);
    default:
      return theme.muted(status);
  }
}

async function handleCreateCommand(
  name: string,
  options: InstanceCreateCommandOptions,
): Promise<void> {
  const manager = getInstanceManager();

  const createOptions: InstanceCreateOptions = {
    name,
    gatewayPort: options.port ? parseInt(options.port, 10) : undefined,
    workspaceDir: options.workspace,
  };

  try {
    const instance = await manager.create(createOptions);
    defaultRuntime.log("");
    defaultRuntime.log(theme.success(`Instance "${name}" created successfully.`));
    defaultRuntime.log("");
    defaultRuntime.log(formatInstanceInfo(instance));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Failed to create instance: ${message}`);
    process.exit(1);
  }
}

function handleListCommand(options: InstanceListCommandOptions): void {
  const manager = getInstanceManager();
  const instances = manager.list();

  if (instances.length === 0) {
    defaultRuntime.log(theme.muted("No instances found."));
    return;
  }

  if (options.json) {
    defaultRuntime.log(JSON.stringify(instances, null, 2));
    return;
  }

  const nameWidth = Math.max(12, ...instances.map((i) => i.name.length));
  const statusWidth = 10;
  const portWidth = 6;

  const header =
    theme.label("Name".padEnd(nameWidth)) +
    " " +
    theme.label("Status".padEnd(statusWidth)) +
    " " +
    theme.label("Port".padEnd(portWidth)) +
    " " +
    theme.label("Created");

  defaultRuntime.log(header);
  defaultRuntime.log(theme.muted("-".repeat(header.length)));

  for (const instance of instances) {
    const name = instance.name.padEnd(nameWidth);
    const status = getInstanceStatusColor(instance.status).padEnd(statusWidth);
    const port = String(instance.gatewayPort).padEnd(portWidth);
    const created = instance.createdAt.split("T")[0];

    defaultRuntime.log(`${name} ${status} ${port} ${created}`);
  }

  defaultRuntime.log("");
  defaultRuntime.log(theme.muted(`Total: ${instances.length} instance(s)`));
}

async function handleStartCommand(
  name: string,
  _options: InstanceStartCommandOptions,
): Promise<void> {
  void _options;
  const manager = getInstanceManager();

  try {
    const instance = await manager.start(name);
    defaultRuntime.log("");
    defaultRuntime.log(theme.success(`Instance "${name}" started successfully.`));
    defaultRuntime.log("");
    defaultRuntime.log(formatInstanceInfo(instance));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Failed to start instance: ${message}`);
    process.exit(1);
  }
}

function handleStopCommand(name: string, options: InstanceStopCommandOptions): void {
  void options;
  const manager = getInstanceManager();

  try {
    const instance = manager.stop(name);
    defaultRuntime.log("");
    defaultRuntime.log(theme.success(`Instance "${name}" stopped successfully.`));
    defaultRuntime.log("");
    defaultRuntime.log(formatInstanceInfo(instance));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Failed to stop instance: ${message}`);
    process.exit(1);
  }
}

function handleDeleteCommand(name: string, options: InstanceDeleteCommandOptions): void {
  const manager = getInstanceManager();

  try {
    manager.delete(name, options.force);

    if (options.keepWorkspace) {
      defaultRuntime.log("");
      defaultRuntime.log(
        theme.success(`Instance "${name}" deleted successfully (workspace preserved).`),
      );
    } else {
      defaultRuntime.log("");
      defaultRuntime.log(theme.success(`Instance "${name}" deleted successfully.`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Failed to delete instance: ${message}`);
    process.exit(1);
  }
}

function handleStatusCommand(name: string, options: InstanceStatusCommandOptions): void {
  const manager = getInstanceManager();
  const instance = manager.get(name);

  if (!instance) {
    defaultRuntime.error(`Instance "${name}" not found.`);
    process.exit(1);
  }

  if (options.json) {
    defaultRuntime.log(JSON.stringify(instance, null, 2));
    return;
  }

  defaultRuntime.log("");
  defaultRuntime.log(formatInstanceInfo(instance, true));

  if (options.deep && instance.status === "running") {
    defaultRuntime.log("");
    defaultRuntime.log(theme.label("Deep health check:"));
    defaultRuntime.log(theme.muted("  (Gateway health check not implemented in this version)"));
  }
}

function handleLogsCommand(name: string, options: InstanceLogsCommandOptions): void {
  void options.since;
  void options.until;
  const manager = getInstanceManager();
  const instance = manager.get(name);

  if (!instance) {
    defaultRuntime.error(`Instance "${name}" not found.`);
    process.exit(1);
  }

  const stateDir = instance.stateDir;
  const logsDir = path.join(stateDir, "logs");

  if (!fs.existsSync(logsDir)) {
    defaultRuntime.error(`Logs directory not found: ${logsDir}`);
    process.exit(1);
  }

  const logFiles = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log"));

  if (logFiles.length === 0) {
    defaultRuntime.log(theme.muted("No log files found."));
    return;
  }

  const mainLogFile = path.join(logsDir, logFiles[0]);

  try {
    const content = fs.readFileSync(mainLogFile, "utf-8");
    const lines = content.split("\n");

    const limit = options.lines ? parseInt(options.lines, 10) : 100;
    const selectedLines = lines.slice(-limit);

    for (const line of selectedLines) {
      defaultRuntime.log(line);
    }

    if (options.follow) {
      defaultRuntime.log("");
      defaultRuntime.log(theme.muted("Log following not implemented in this version."));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Failed to read logs: ${message}`);
    process.exit(1);
  }
}

export function registerInstanceCli(program: Command) {
  const instance = program
    .command("instance")
    .description("Manage multiple OpenClaw instances")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw instance create myinstance", "Create a new instance."],
          ["openclaw instance list", "List all instances."],
          ["openclaw instance start myinstance", "Start an instance."],
          ["openclaw instance stop myinstance", "Stop an instance."],
          ["openclaw instance delete myinstance", "Delete an instance."],
          ["openclaw instance status myinstance", "Get instance status."],
          ["openclaw instance logs myinstance", "View instance logs."],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/instance", "docs.openclaw.ai/cli/instance")}\n`,
    );

  instance
    .command("create <name>")
    .description("Create a new OpenClaw instance")
    .option("-p, --port <number>", "Gateway port (auto-allocated if omitted)")
    .option("-w, --workspace <path>", "Custom workspace directory")
    .action(handleCreateCommand);

  instance
    .command("list")
    .description("List all instances")
    .option("--json", "Output as JSON")
    .option("--status", "Include runtime status")
    .action(handleListCommand);

  instance
    .command("start <name>")
    .description("Start an instance")
    .option("-b, --background", "Run in background (daemon mode)")
    .option("-w, --watch", "Watch logs after start")
    .action(handleStartCommand);

  instance
    .command("stop <name>")
    .description("Stop an instance")
    .option("-f, --force", "Force stop (SIGKILL)")
    .action(handleStopCommand);

  instance
    .command("delete <name>")
    .description("Delete an instance")
    .option("-f, --force", "Delete even if running")
    .option("-k, --keep-workspace", "Preserve workspace files")
    .action(handleDeleteCommand);

  instance
    .command("status <name>")
    .description("Get instance status")
    .option("--json", "Output as JSON")
    .option("--deep", "Deep health check")
    .action(handleStatusCommand);

  instance
    .command("logs <name>")
    .description("View instance logs")
    .option("-n, --lines <n>", "Number of lines (default: 100)")
    .option("-f, --follow", "Follow log output")
    .option("--since <time>", "Logs since timestamp")
    .option("--until <time>", "Logs until timestamp")
    .action(handleLogsCommand);
}

function formatHelpExamples(examples: Array<[string, string]>): string {
  return examples
    .map(([cmd, desc]) => {
      const padded = `  ${cmd}`.padEnd(28);
      return `${padded}${desc}`;
    })
    .join("\n");
}
