# OpenClaw Multi-Instance Feature Specification

## 1. Feature Overview

The Multi-Instance feature enables running multiple isolated OpenClaw Gateway instances on a single host. Each instance operates independently with its own configuration, state directory, workspace, and messaging channels. This feature is essential for:

- **Isolation**: Running separate instances for different purposes (production vs. development)
- **Redundancy**: Deploying rescue bots that remain operational when the primary bot is down
- **Multi-tenant**: Hosting multiple agents with separate configurations on one machine
- **Testing**: Running isolated test instances without affecting production

## 2. Goals

### Primary Goals

- Enable creation, management, and deletion of multiple isolated OpenClaw instances
- Provide CLI commands for full instance lifecycle management (create, list, start, stop, delete)
- Ensure complete isolation between instances (config, state, workspace, ports)
- Support automatic port allocation to prevent conflicts
- Integrate with existing gateway and profile systems

### Secondary Goals

- Instance health monitoring and status reporting
- Bulk operations (start all, stop all)
- Instance configuration inheritance from base configuration
- Migration utilities for converting single-instance setups to multi-instance

## 3. Architecture Design

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw CLI                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Instance Management Layer                    │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │   │
│  │  │  create   │  │   list    │  │      start        │  │   │
│  │  └────────────┘  └────────────┘  └────────────────────┘  │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │   │
│  │  │   stop     │  │  delete   │  │       logs        │  │   │
│  │  └────────────┘  └────────────┘  └────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    InstanceManager (Core)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  instances.json (metadata store)                         │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ {                                                    │ │   │
│  │  │   "name": "rescue",                                  │ │   │
│  │  │   "stateDir": "~/.openclaw-instances/rescue/state",│ │   │
│  │  │   "configPath": "~/.openclaw-instances/rescue/...", │ │   │
│  │  │   "workspaceDir": "~/.openclaw-instances/.../ws",  │ │   │
│  │  │   "gatewayPort": 19001,                              │ │   │
│  │  │   "status": "running",                               │ │   │
│  │  │   "createdAt": "2026-02-24T...",                    │ │   │
│  │  │   "lastStartedAt": "2026-02-24T..."                 │ │   │
│  │  │ }                                                    │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Instance A   │  │   Instance B   │  │   Instance C   │
│   (main)       │  │   (rescue)     │  │   (dev)        │
│                 │  │                 │  │                 │
│ Config:        │  │ Config:        │  │ Config:        │
│ - Port: 18789  │  │ - Port: 19001  │  │ - Port: 19201  │
│ - State: ~/.oc │  │ - State: ~/.oc │  │ - State: ~/.oc │
│ - Workspace:   │  │ - Workspace:   │  │ - Workspace:   │
│   ~/main-ws    │  │   ~/rescue-ws  │  │   ~/dev-ws     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Directory Structure

```
~/.openclaw-instances/
├── instances.json              # Central instance registry
├── main/
│   ├── config/
│   │   └── openclaw.json      # Instance-specific config
│   ├── state/                 # Session data, credentials
│   │   └── agents/
│   └── workspace/            # Agent workspace files
├── rescue/
│   ├── config/
│   ├── state/
│   └── workspace/
└── dev/
    ├── config/
    ├── state/
    └── workspace/
```

### Instance Metadata Schema

```typescript
interface InstanceInfo {
  name: string; // Unique instance identifier
  stateDir: string; // Path to instance state directory
  configPath: string; // Path to instance config file
  workspaceDir: string; // Path to instance workspace
  gatewayPort: number; // Gateway HTTP port
  createdAt: string; // ISO timestamp
  lastStartedAt?: string; // ISO timestamp of last start
  status: InstanceStatus; // Current runtime status
}

type InstanceStatus = "stopped" | "running" | "starting" | "error";
```

### Port Allocation Strategy

- **Default base port**: 18789 (main instance)
- **Port range**: 18790-18889 for auto-allocation
- **Derived ports**:
  - Browser control: base + 2
  - CDP ports: base + 9 to base + 108

### Configuration Inheritance

Each instance inherits from a base configuration with the following overrides:

```typescript
interface InstanceConfig {
  instance: {
    name: string; // Instance name
    parentConfig: boolean; // Marks as child config
  };
  gateway: {
    port: number; // Unique per instance
  };
  agents: {
    defaults: {
      workspace: string; // Per-instance workspace
    };
  };
}
```

## 4. API Interface (CLI Commands)

### Core Commands

```bash
# Create a new instance
openclaw instance create <name> [options]
  --port <number>           # Gateway port (auto-allocated if omitted)
  --workspace <path>        # Custom workspace directory
  --inherit                 # Inherit from base config
  --from-profile <name>    # Clone from existing profile

# List all instances
openclaw instance list [options]
  --json                    # JSON output
  --status                  # Include runtime status

# Start an instance
openclaw instance start <name> [options]
  --background              # Run in background (daemon mode)
  --watch                   # Watch logs after start

# Stop an instance
openclaw instance stop <name> [options]
  --force                   # Force stop (SIGKILL)

# Restart an instance
openclaw instance restart <name>

# Delete an instance
openclaw instance delete <name> [options]
  --force                   # Delete even if running
  --keep-workspace          # Preserve workspace files

# Get instance status
openclaw instance status <name> [options]
  --json                    # JSON output
  --deep                    # Deep health check

# View instance logs
openclaw instance logs <name> [options]
  --lines <n>               # Number of lines (default: 100)
  --follow                  # Follow log output
  --since <time>            # Logs since timestamp
  --until <time>            # Logs until timestamp

# Execute command in instance context
openclaw instance exec <name> -- <command> [args...]

# Get instance config path
openclaw instance config-path <name>
```

### Utility Commands

```bash
# Start all instances
openclaw instance start-all

# Stop all instances
openclaw instance stop-all

# Port availability check
openclaw instance ports check

# Migrate existing setup to multi-instance
openclaw instance migrate [options]
  --name <instance-name>   # Name for the new instance
  --port <number>          # Port for the new instance
```

### Global Flags

```bash
--instance <name>          # Target specific instance (shortcut)
--all-instances            # Apply to all instances
```

## 5. Data Structures

### InstanceInfo

```typescript
interface InstanceInfo {
  name: string;
  stateDir: string;
  configPath: string;
  workspaceDir: string;
  gatewayPort: number;
  createdAt: string;
  lastStartedAt?: string;
  status: InstanceStatus;
  error?: string;
}
```

### InstanceCreateOptions

```typescript
interface InstanceCreateOptions {
  name: string;
  gatewayPort?: number;
  workspaceDir?: string;
  inheritConfig?: Partial<OpenClawConfig>;
  copyFromProfile?: string;
}
```

### MultiInstanceConfig

```typescript
interface MultiInstanceConfig {
  instancesDir: string; // Base directory for all instances
  defaultGatewayPort: number; // Default port for main instance
  portRangeStart: number; // Start of auto-allocation range
  portRangeEnd: number; // End of auto-allocation range
}

const DEFAULT_MULTI_INSTANCE_CONFIG: MultiInstanceConfig = {
  instancesDir: ".openclaw-instances",
  defaultGatewayPort: 18789,
  portRangeStart: 18790,
  portRangeEnd: 18889,
};
```

### Instance Status Response

```typescript
interface InstanceStatusResponse {
  name: string;
  status: InstanceStatus;
  uptime?: number; // Seconds since start
  gatewayUrl: string;
  pid?: number; // Process ID if running
  memoryUsage?: number; // RSS in bytes
  lastError?: string;
}
```

## 6. Workflows

### Workflow 1: Create and Start New Instance

```
User: openclaw instance create rescue --port 19001
  │
  ▼
CLI: Validate name format (alphanumeric + _-)
  │
  ▼
CLI: Check instances.json for duplicate name
  │
  ▼
Manager: Allocate port (19001 or next available)
  │
  ▼
Manager: Create directory structure
  │  ~/.openclaw-instances/rescue/
  │  ├── config/openclaw.json
  │  ├── state/
  │  └── workspace/
  │
  ▼
Manager: Generate inherited config with port/workspace overrides
  │
  ▼
Manager: Write instances.json metadata
  │
  ▼
CLI: Display success with instance details
```

### Workflow 2: Start Instance

```
User: openclaw instance start rescue
  │
  ▼
CLI: Load instances.json metadata
  │
  ▼
CLI: Check if already running
  │
  ▼
Manager: Set status = "starting", update instances.json
  │
  ▼
Process: Spawn gateway with env vars:
  │  OPENCLAW_CONFIG_PATH=<configPath>
  │  OPENCLAW_STATE_DIR=<stateDir>
  │  OPENCLAW_GATEWAY_PORT=<port>
  │  OPENCLAW_INSTANCE=rescue
  │
  ▼
Manager: Verify gateway HTTP server responds
  │
  ▼
Manager: Set status = "running", record lastStartedAt
  │
  ▼
CLI: Display status and gateway URL
```

### Workflow 3: Instance Health Check

```
User: openclaw instance status rescue --deep
  │
  ▼
CLI: Load instances.json metadata
  │
  ▼
CLI: Check process status (if local)
  │
  ▼
CLI: HTTP GET http://localhost:<port>/health
  │
  ▼
CLI: Check gateway capabilities endpoint
  │
  ▼
CLI: Return comprehensive status:
  │  - Process alive
  │  - HTTP responsive
  │  - Channels connected
  │  - Agents loaded
```

## 7. Edge Cases

### Port Conflicts

- **Scenario**: User requests port 18789 but main instance uses it
- **Resolution**: Error with suggestion: `Port 18789 is in use by 'main'. Use --port 19001 or omit for auto-allocation.`

### Orphaned Processes

- **Scenario**: Instance process crashes without updating status
- **Resolution**: On start, detect stale "running" status and verify process; update to "error" if dead

### Disk Space

- **Scenario**: Creating instance on full disk
- **Resolution**: Pre-check available space; fail fast with clear message

### Concurrent Operations

- **Scenario**: User starts instance while it's already starting
- **Resolution**: Idempotent check; return current status with note

### Workspace Conflicts

- **Scenario**: Custom workspace path already exists and is not empty
- **Resolution**: Warn user; require --force or different path

### Config Corruption

- **Scenario**: Instance config file is malformed
- **Resolution**: Load error provides path; suggest re-create or fix manually

### Port Range Exhaustion

- **Scenario**: All ports in range 18790-18889 are allocated
- **Resolution**: Clear error with suggestion to specify explicit port outside range

### Deletion of Running Instance

- **Scenario**: User tries to delete instance that's running
- **Resolution**: Refuse with error; suggest `openclaw instance stop <name>` first, or use `--force`

### Profile Migration

- **Scenario**: User wants to convert existing --profile setup to multi-instance
- **Resolution**: `openclaw instance migrate --from-profile main` reads existing config/state and creates isolated instance

## 8. Acceptance Criteria

### Functional Criteria

| ID  | Criterion                                | Test Scenario                                                                   |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| F1  | Instance can be created with custom name | `openclaw instance create test-instance` creates directory structure and config |
| F2  | Instance can be listed                   | `openclaw instance list` shows all instances with status                        |
| F3  | Instance starts and becomes healthy      | `openclaw instance start test` followed by health check returns success         |
| F4  | Instance stops cleanly                   | `openclaw instance stop test` terminates process, updates status                |
| F5  | Instance can be deleted                  | `openclaw instance delete test` removes all instance files                      |
| F6  | Auto port allocation works               | Create 3 instances without ports; each gets unique port                         |
| F7  | Config isolation verified                | Two instances with same channel type don't share sessions                       |
| F8  | Workspace isolation verified             | Instance A workspace doesn't contain Instance B files                           |
| F9  | Instance logs accessible                 | `openclaw instance logs test` shows recent log output                           |
| F10 | Instance status shows accurate info      | Status includes uptime, gateway URL, error state                                |

### Non-Functional Criteria

| ID  | Criterion                    | Target                    |
| --- | ---------------------------- | ------------------------- |
| NF1 | Instance creation time       | < 3 seconds               |
| NF2 | Instance start time          | < 5 seconds               |
| NF3 | List command latency         | < 100ms for 10 instances  |
| NF4 | Memory overhead per instance | < 50MB (gateway baseline) |

### Error Handling Criteria

| ID  | Criterion                | Test Scenario                                           |
| --- | ------------------------ | ------------------------------------------------------- |
| E1  | Duplicate name rejected  | Create `dup`, try create `dup` again → error            |
| E2  | Invalid name rejected    | Create `invalid name!` → error with valid format        |
| E3  | Missing instance handled | Stop nonexistent → clear error                          |
| E4  | Port conflict detected   | Create with used port → error with alternative          |
| E5  | Network errors handled   | Gateway unreachable → status shows "error" with message |

## 9. Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Goals**: Establish the foundation for instance management

- [ ] Enhance `InstanceManager` class with:
  - [ ] Process spawning with environment variables
  - [ ] Process lifecycle management (PID tracking)
  - [ ] Health check integration
- [ ] Update instance metadata schema to include PID and health info
- [ ] Implement port conflict detection
- [ ] Add instance process supervision

**Deliverables**:

- Updated `src/multi-instance/manager.ts`
- Updated `src/multi-instance/types.ts`

### Phase 2: CLI Integration (Week 2)

**Goals**: Expose instance management through CLI

- [ ] Register `instance` command group in CLI
- [ ] Implement `instance create` command
- [ ] Implement `instance list` command
- [ ] Implement `instance start/stop` commands
- [ ] Implement `instance delete` command
- [ ] Implement `instance status` command
- [ ] Implement `instance logs` command
- [ ] Add bash/zsh completion for instance names

**Deliverables**:

- New CLI commands in `src/cli/program/register.instance.ts`
- Command implementations in `src/commands/instance/`

### Phase 3: Configuration Integration (Week 2-3)

**Goals**: Deep integration with config system

- [ ] Add `instance` section to config schema
- [ ] Implement `--instance` global flag
- [ ] Create config validation for instance settings
- [ ] Add instance-aware config get/set commands

**Deliverables**:

- Config schema updates
- Global flag handling

### Phase 4: Observability (Week 3)

**Goals**: Debugging and monitoring support

- [ ] Structured logging for instance operations
- [ ] Instance health monitoring endpoint
- [ ] Metrics export (uptime, restarts, errors)
- [ ] Integration with `openclaw status`

**Deliverables**:

- Logging enhancements
- Health check improvements

### Phase 5: Polish & Testing (Week 4)

**Goals**: Robustness and user experience

- [ ] Comprehensive unit tests for InstanceManager
- [ ] Integration tests for CLI commands
- [ ] Error message improvements
- [ ] Documentation (CLI reference, guides)
- [ ] Migration tools for existing setups

**Deliverables**:

- Test suite
- User documentation

## 10. Dependencies and Integration Points

### Internal Dependencies

- **Config system**: Instance config inheritance and validation
- **Gateway**: Health check, process supervision
- **Channels**: Per-instance channel initialization
- **Sessions**: Per-instance session storage

### External Dependencies

- **Node.js process management**: Child process spawning
- **File system**: Directory operations
- **Network**: Port allocation and health checks

### Integration Points

- `src/config/paths.ts`: Resolve per-instance paths
- `src/config/io.ts`: Load/save instance configs
- `src/cli/gateway-cli/`: Gateway process management
- `src/commands/status.ts`: Instance status in main status

## 11. Future Considerations

- **Remote instance management**: SSH-based instance control on remote hosts
- **Instance templates**: Pre-configured instance blueprints
- **Cluster mode**: Distributed instance management
- **Backup/restore**: Instance snapshot and restore
- **Metrics aggregation**: Cross-instance analytics
