---
title: Scheduled Command Schema
type: type_definition
type_name: scheduled-command
extends: entity
description: Scheduled commands define CLI commands to execute at specified times
base_uri: sys:system/schema/scheduled-command.md
created_at: '2026-02-07T18:30:00.000Z'
entity_id: d814d68f-97ec-4fda-aaf6-929e751a7533
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
updated_at: '2026-02-11T01:38:09.000Z'
properties:
  - name: command
    type: string
    required: true
    description: CLI command to execute
  - name: schedule_type
    type: string
    enum:
      - expr
      - at
      - every
    required: true
    description: Type of schedule (expr for cron, at for one-shot, every for interval)
  - name: schedule
    type: string
    required: true
    description: Schedule expression (cron for expr, ISO timestamp for at, duration for every)
  - name: timezone
    type: string
    required: false
    description: Timezone for cron expressions (e.g., America/New_York)
  - name: working_directory
    type: string
    required: false
    description: Working directory for command execution
  - name: queue_tags
    type: array
    items:
      type: string
    required: false
    description: Tags for CLI queue concurrency control (base_uri format)
  - name: queue_priority
    type: number
    required: false
    description: Priority for CLI queue (lower number equals higher priority, default 10)
  - name: timeout_ms
    type: number
    required: false
    description: Command timeout in milliseconds
  - name: execution_mode
    type: string
    enum:
      - host
      - container
    required: false
    description: Where to execute command (host default, or container via docker exec)
  - name: enabled
    type: boolean
    required: false
    description: Whether the schedule is active (default true)
  - name: last_triggered_at
    type: datetime
    required: false
    description: Timestamp of the last trigger (auto-updated)
  - name: next_trigger_at
    type: datetime
    required: false
    description: Computed next trigger time
  - name: run_on_machines
    type: array
    items:
      type: string
    required: false
    description: >-
      Machine identifiers from the machine_registry config that should execute this schedule.
      Empty array or omitted means run on all machines.
  - name: job_id
    type: string
    required: false
    description: Job ID for job tracker integration
---

# Scheduled Command

Scheduled commands define CLI commands to execute at specified times. They integrate with the CLI queue system for command execution and support various scheduling patterns.

## Schedule Types

| Type    | Format                              | Behavior                                 |
| ------- | ----------------------------------- | ---------------------------------------- |
| `expr`  | Cron expression (e.g., `0 2 * * *`) | Recurring, computes next from expression |
| `at`    | ISO 8601 timestamp                  | One-shot execution at specific time      |
| `every` | Duration (e.g., `30m`, `6h`, `1d`)  | Recurring, adds interval to last trigger |

## Examples

### Cron Expression (expr)

```yaml
---
title: Run Tests Nightly
type: scheduled-command
command: bun test:all
schedule_type: expr
schedule: '0 2 * * *'
timezone: America/Los_Angeles
enabled: true
---
```

### One-Shot (at)

```yaml
---
title: Deploy Release
type: scheduled-command
command: yarn deploy:production
schedule_type: at
schedule: '2026-03-01T14:00:00.000Z'
enabled: true
---
```

### Interval (every)

```yaml
---
title: Sync Players
type: scheduled-command
command: base entity sync players
schedule_type: every
schedule: 6h
working_directory: /path/to/league
queue_tags:
  - user:tag/sync.md
enabled: true
---
```

## Queue Integration

Scheduled commands use the CLI queue for execution:

- `queue_tags`: Control concurrency with tag-based limits
- `queue_priority`: Lower numbers execute first (default: 10)
- `timeout_ms`: Override default 5-minute timeout
- `execution_mode`: `host` (default) or `container`

## File Organization

Scheduled commands are stored in `scheduled-command/` with optional nested folders:

```
scheduled-command/
  base/
    run-tests-nightly.md
  league/
    sync-players.md
  maintenance/
    cleanup-temp-files.md
```
