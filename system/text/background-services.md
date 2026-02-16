---
title: Background Services
type: text
description: Overview of PM2-managed background services for command scheduling, execution, and data management
base_uri: sys:system/text/background-services.md
created_at: '2026-02-09T00:00:00.000Z'
entity_id: f8a92b4c-7d1e-4c3f-9a5b-2e6d8f0c1a3b
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/schema/scheduled-command.md]]
  - relates_to [[sys:system/schema/database.md]]
updated_at: '2026-02-09T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:35:01.121Z'
---

# Background Services

The Base system includes several PM2-managed background services that enable automated command execution and data management. These run independently of interactive sessions.

## Service Overview

| Service                    | Purpose                         | Polling Interval    |
| -------------------------- | ------------------------------- | ------------------- |
| `schedule-processor`       | Triggers due scheduled commands | 60 seconds          |
| `cli-queue-worker`         | Executes queued CLI commands    | Continuous (BullMQ) |
| `metadata-queue-processor` | Analyzes thread metadata        | File-based queue    |

## Scheduled Command System

The schedule system enables time-based automation through entity files. Users define schedules as `scheduled-command` entities; the `schedule-processor` service polls these and enqueues due commands.

### Architecture

```
scheduled-command/              # User-defined schedule entities
    └── *.md                    # Each file defines one schedule

libs-server/schedule/           # Core utilities
    ├── parse-schedule.mjs      # Cron/interval parsing
    ├── load-schedules.mjs      # Entity discovery
    └── trigger-schedule.mjs    # Queue integration

server/services/
    └── schedule-processor.mjs  # PM2 service (polls every 60s)
```

### Schedule Types

| Type    | Format             | Example                | Behavior                  |
| ------- | ------------------ | ---------------------- | ------------------------- |
| `expr`  | Cron expression    | `0 2 * * *`            | Recurring, timezone-aware |
| `at`    | ISO 8601 timestamp | `2026-03-01T14:00:00Z` | One-shot execution        |
| `every` | Duration string    | `6h`, `30m`, `1d`      | Recurring interval        |

### Entity Schema

Schedules use the `scheduled-command` schema with key properties:

- `command` - CLI command to execute
- `schedule_type` - One of: expr, at, every
- `schedule` - Cron expression, timestamp, or duration
- `enabled` - Toggle schedule on/off
- `last_triggered_at` / `next_trigger_at` - Auto-updated timestamps

See [[sys:system/schema/scheduled-command.md]] for full schema.

### CLI Access

```bash
base schedule list                    # List all schedules
base schedule add "cmd" --type expr --schedule "0 * * * *"
base schedule enable path/to/schedule.md
base schedule trigger path/to/schedule.md   # Force immediate execution
```

## CLI Command Queue

The command queue provides asynchronous command execution with concurrency control via BullMQ and Redis.

### Architecture

```
libs-server/cli-queue/          # Queue infrastructure
    ├── add-cli-job.mjs         # Enqueue commands
    ├── execute-command.mjs     # Command execution
    └── tag-limiter.mjs         # Concurrency control

server/services/
    └── cli-queue-worker.mjs    # PM2 worker service
```

### Features

- **Tag-based concurrency**: Limit simultaneous commands by tag (e.g., max 3 claude-session jobs)
- **Priority levels**: Lower number = higher priority
- **Timeout handling**: Configurable per-job with graceful shutdown
- **Working directory**: Commands can specify execution directory

### CLI Access

```bash
base queue add "yarn test" --tags test,ci --priority 5
base queue status <job-id>
base queue stats
```

### Integration

Scheduled commands flow through the queue:

1. `schedule-processor` detects due schedule
2. Calls `add_cli_job()` to enqueue command
3. `cli-queue-worker` picks up and executes
4. Entity updated with `last_triggered_at`

## Database System

The database system provides structured data storage through multiple backends with a unified interface. Users define database schemas as `database` entities.

### Architecture

```
database/                       # User-defined database entities
    └── *.md                    # Each file defines one database schema

libs-server/database/           # Core infrastructure
    ├── get-database-entity.mjs # Entity lookup
    └── storage-adapters/       # Backend implementations
        ├── duckdb-adapter.mjs
        ├── postgres-adapter.mjs
        ├── tsv-adapter.mjs
        └── markdown-adapter.mjs
```

### Storage Backends

| Backend    | Use Case                          | Storage                         |
| ---------- | --------------------------------- | ------------------------------- |
| `duckdb`   | Embedded analytics, local queries | Single DuckDB file              |
| `postgres` | External database, shared access  | PostgreSQL server               |
| `tsv`      | Simple data, human-readable       | Tab-separated file              |
| `markdown` | Entity integration                | Markdown files with frontmatter |

### Entity Schema

Databases use the `database` schema with key properties:

- `table_name` - Logical identifier
- `fields` - Column definitions with types/constraints
- `storage_config` - Backend and connection details
- `indexes` - Optional index definitions

See [[sys:system/schema/database.md]] for full schema.

### CLI Access

```bash
base database list                    # List all databases
base database info <name>             # Show schema details
base database query <name> --filter "field=value" --limit 10
base database insert <name> --data '{"field": "value"}'
base database sync <name>             # Create/update table from schema
```

## Service Management

All services are configured in `pm2.config.js`:

```bash
pm2 start pm2.config.js         # Start all services
pm2 stop schedule-processor     # Stop specific service
pm2 logs cli-queue-worker       # View logs
pm2 status                      # Check status
```

## Related Documentation

- [[sys:system/schema/scheduled-command.md]] - Schedule entity schema
- [[sys:system/schema/database.md]] - Database entity schema
- [[sys:system/text/system-design.md]] - Overall architecture
