---
title: Scheduled Command System
type: text
description: >-
  Comprehensive reference for the scheduled command lifecycle covering entity creation, schedule
  types (expr/at/every), processor polling, queue integration, machine filtering, and
  troubleshooting
created_at: '2026-03-02T01:57:13.461Z'
entity_id: 9a77603c-da75-47e5-a8d5-f45811044c9b
base_uri: sys:system/text/scheduled-command-system.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/background-services.md]]
  - relates_to [[sys:system/text/cli-queue-system.md]]
  - relates_to [[sys:system/schema/scheduled-command.md]]
updated_at: '2026-03-02T01:57:13.461Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Scheduled Command System

The scheduled command system enables automated CLI command execution at specified times. Schedules are stored as entities in the user-base `scheduled-command/` directory and processed by the `schedule-processor` PM2 service, which enqueues due commands to the CLI queue for execution.

## Schedule Types

Three schedule types control when commands execute:

### Expression (expr)

Standard cron expressions for recurring schedules.

- Format: Cron syntax (e.g., `0 2 * * *` for 2 AM daily, `*/30 * * * *` for every 30 minutes)
- Optional `timezone` field (IANA format like `America/New_York`) controls interpretation
- Without timezone, expressions evaluate in UTC
- Uses `cron-parser` library to calculate next occurrence from `last_triggered_at` or current time

### One-Shot (at)

ISO 8601 timestamps for single execution.

- Format: `2026-03-01T14:00:00.000Z`
- Executes once when the timestamp is reached
- Past timestamps trigger immediately on next processor poll
- Schedule can be deleted after execution or left in place (will not re-trigger)

### Interval (every)

Duration strings for recurring fixed-interval execution.

- Format: `ms` package syntax (e.g., `5m`, `6h`, `1d`, `2w`)
- Base time priority: `last_triggered_at` > `created_at` > now
- New schedules become due after one interval from creation

## Entity Structure

Scheduled commands are entities of type `scheduled-command` stored in `scheduled-command/` with optional nested folder organization (e.g., `base/`, `league/`, `maintenance/`).

### Required Fields

| Field           | Type   | Description                                 |
| --------------- | ------ | ------------------------------------------- |
| `command`       | string | CLI command to execute                      |
| `schedule_type` | enum   | `expr`, `at`, or `every`                    |
| `schedule`      | string | Cron expression, ISO timestamp, or duration |

### Schedule Configuration

| Field               | Type    | Default | Description                                                          |
| ------------------- | ------- | ------- | -------------------------------------------------------------------- |
| `timezone`          | string  | UTC     | IANA timezone for cron expressions                                   |
| `working_directory` | string  | -       | Working directory for command execution                              |
| `enabled`           | boolean | true    | Whether the schedule is active                                       |
| `run_on_machines`   | array   | all     | Machine IDs from `config.machine_registry`; empty means all machines |

### Queue Integration

| Field            | Type   | Default | Description                                        |
| ---------------- | ------ | ------- | -------------------------------------------------- |
| `queue_tags`     | array  | []      | Tags for concurrency control (base_uri format)     |
| `queue_priority` | number | 10      | Priority (lower number = higher priority)          |
| `timeout_ms`     | number | 300000  | Command timeout in milliseconds (5 min default)    |
| `execution_mode` | enum   | host    | `host` (direct shell) or `container` (docker exec) |

### Runtime Metadata

| Field               | Type          | Description                                               |
| ------------------- | ------------- | --------------------------------------------------------- |
| `last_triggered_at` | ISO timestamp | Auto-updated on trigger, stored in `.schedule-state.json` |
| `next_trigger_at`   | ISO timestamp | Computed on demand, never persisted in entity             |

## Processor Architecture

The `schedule-processor` PM2 service polls every 60 seconds and enqueues due commands to the CLI queue.

### Polling Flow

1. Load all schedule entities recursively from `scheduled-command/`
2. Merge runtime state from `.schedule-state.json` (for `last_triggered_at`)
3. Compute `next_trigger_at` for each schedule on demand
4. Filter: `enabled === true`, `next_trigger_at <= now`, machine filter passes
5. For each due schedule: enqueue to CLI queue via `add_cli_job()`, update state file
6. Schedule next poll in 60 seconds

### State Management

Runtime state is separated from entity definitions:

- **Entity files** (`.md`): Static schedule definition and metadata, managed by CLI commands and git
- **State file** (`.schedule-state.json`): Maps `entity_id` to `{ last_triggered_at }`, updated atomically by the processor
- **In-memory**: Only `is_running` flag and poll timer, lost on restart (non-critical)

This separation prevents constant writes to entity files and supports processor restarts without losing trigger history.

### Machine Filtering

Schedules can target specific machines using `run_on_machines`:

- Omitted or empty array: execute on all machines
- Specified array: only machines listed by their `machine_registry` key
- Machine identity resolved by matching `os.hostname()` against registry entries, with platform fallback

## CLI Interface

All commands are under `base schedule`:

```bash
# List all schedules
base schedule list
base schedule list --jobs              # Enrich with job execution data (last_run_at, last_run_status)
base schedule list --verbose --json

# Create a schedule
base schedule add "yarn test:all" --type expr --schedule "0 2 * * *" \
  --title "Nightly Tests" --timezone America/New_York \
  --folder base --tags user:tag/ci.md --priority 5 --timeout 600000

# Enable/disable
base schedule enable base/nightly-tests.md
base schedule disable base/nightly-tests.md

# Force immediate execution (ignores enabled state)
base schedule trigger base/nightly-tests.md

# Delete permanently
base schedule delete base/nightly-tests.md
```

File path arguments accept relative paths from `scheduled-command/` and auto-append `.md`.

## Queue Integration

When a schedule triggers, the processor enqueues the command to the BullMQ-based CLI queue:

1. `trigger_schedule()` calls `add_cli_job()` with the command, tags, priority, timeout, working directory, and execution mode
2. Job metadata includes schedule title, entity ID, and trigger timestamp
3. The `cli-queue-worker` PM2 service picks up jobs, acquires tag-based concurrency locks, and executes
4. Tag concurrency limits are configured in `config.json` under `cli_queue.tag_limits`

For queue architecture details, see [[sys:system/text/cli-queue-system.md]].

## Common Patterns

### Daily Job with Timezone

```yaml
command: yarn deploy:prod
schedule_type: expr
schedule: '0 14 * * 1-5'
timezone: America/Los_Angeles
queue_tags:
  - user:tag/deploy.md
queue_priority: 1
timeout_ms: 1800000
```

### Periodic Health Check

```yaml
command: 'curl -f https://api.example.com/health || exit 1'
schedule_type: every
schedule: 5m
timeout_ms: 30000
```

### Machine-Specific Sync

```yaml
command: rsync -av $USER_BASE_DIRECTORY/data/ server:/backup/data/
schedule_type: every
schedule: 6h
run_on_machines:
  - laptop
```

## Troubleshooting

### Schedule Never Triggers

1. **Check enabled status**: `base schedule list --verbose` -- look for disabled schedules
2. **Validate syntax**: Re-run `base schedule add` with the same expression to check for parse errors
3. **Check timezone**: Omitted timezone defaults to UTC; add explicit timezone if needed
4. **Check processor**: `pm2 status` and `pm2 logs schedule-processor`
5. **Check machine filter**: Verify current machine is in `run_on_machines` if specified
6. **Check state**: `cat scheduled-command/.schedule-state.json` for `last_triggered_at` values

### Command Fails After Triggering

1. **Check worker logs**: `pm2 logs cli-queue-worker` for exit codes and errors
2. **Test manually**: Run the command in the specified `working_directory`
3. **Check timeout**: Increase `timeout_ms` if the command needs more time (default is 5 minutes)
4. **Check environment**: Commands inherit PM2 worker environment; verify `$USER_BASE_DIRECTORY` is set

### Debug Logging

```bash
# Processor debug output
DEBUG=schedule:* pm2 restart schedule-processor
pm2 logs schedule-processor

# Queue worker debug output
DEBUG=cli-queue:* pm2 restart cli-queue-worker
pm2 logs cli-queue-worker
```

Debug namespaces: `schedule:processor`, `schedule:load`, `schedule:parse`, `schedule:trigger`, `schedule:state`, `schedule:machine`.

## Key Modules

| Module                                      | Purpose                                       |
| ------------------------------------------- | --------------------------------------------- |
| `libs-server/schedule/parse-schedule.mjs`   | Schedule time calculation for all three types |
| `libs-server/schedule/load-schedules.mjs`   | Load entities and filter due schedules        |
| `libs-server/schedule/trigger-schedule.mjs` | Enqueue command and update state              |
| `libs-server/schedule/schedule-state.mjs`   | State file read/write operations              |
| `libs-server/schedule/machine-identity.mjs` | Machine detection from registry               |
| `server/services/schedule-processor.mjs`    | PM2 polling service                           |
| `cli/base/schedule.mjs`                     | CLI command interface                         |
| `system/schema/scheduled-command.md`        | Entity type definition                        |
