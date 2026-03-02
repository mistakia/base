---
title: CLI Queue System
type: text
description: >-
  Reference for the BullMQ-based command queue covering job lifecycle, tag-based concurrency
  control, execution modes, timeout handling, and monitoring
created_at: '2026-03-02T06:33:47.707Z'
entity_id: 4e9f5de2-0ae8-4ab6-8846-b8756b384276
base_uri: sys:system/text/cli-queue-system.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/background-services.md]]
  - relates_to [[sys:system/text/scheduled-command-system.md]]
updated_at: '2026-03-02T06:33:47.707Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# CLI Queue System

The CLI queue system provides background command execution with tag-based concurrency control. Built on BullMQ with Redis, it serves as the execution backend for scheduled commands, thread analysis, and manual job submissions.

## Architecture

The queue consists of three components:

- **Queue** (`libs-server/cli-queue/queue.mjs`): Job creation and status queries via BullMQ
- **Tag Limiter** (`libs-server/cli-queue/tag-limiter.mjs`): Atomic concurrency control using Redis Lua scripts
- **Worker** (`libs-server/cli-queue/worker.mjs`): Job processing with host and container execution modes

Redis stores job state and tag registrations. The `cli-queue-worker` PM2 service runs the worker process.

## Job Structure

Each job contains:

| Field               | Type          | Description                                   |
| ------------------- | ------------- | --------------------------------------------- |
| `command`           | string        | CLI command to execute                        |
| `tags`              | array         | Tag base_uris for concurrency control         |
| `working_directory` | string        | Execution directory                           |
| `timeout_ms`        | number        | Command timeout (default: 300000)             |
| `execution_mode`    | enum          | `host` or `container`                     |
| `metadata`          | object        | Caller-provided context (schedule info, etc.) |
| `queued_at`         | ISO timestamp | When the job was created                      |

Job IDs use the format `cli-{uuid}`.

## Job Lifecycle

1. **Waiting**: Job queued via `add_cli_job()`, ready for worker pickup
2. **Active**: Worker acquired job, attempting tag acquisition
3. **Delayed**: Tag limit reached -- job retries every 2 seconds until tags available
4. **Completed**: Command executed successfully (removed after 1 hour or 100 jobs)
5. **Failed**: Max retries exceeded (kept 24 hours for debugging)

Default retry policy: 2 attempts with exponential backoff starting at 30 seconds.

## Tag-Based Concurrency Control

Tags limit how many commands of a given type run simultaneously. Each job declares tags; the worker must acquire all tags before execution.

### Acquisition Mechanism

A Redis Lua script atomically checks all tag limits and registers the job:

1. For each tag, count current registrations in Redis Set `cli-queue:tag:{tag-name}`
2. If any tag is at its configured limit, acquisition fails -- returns blocking tag names
3. If all tags have capacity, atomically add job ID to all tag Sets
4. On failure, worker moves job to delayed state (2-second retry interval)

The acquisition is idempotent: if a job is already registered for a tag (e.g., after worker restart), it does not count against its own limit.

### Configuration

Tag limits are set in `config.json` under `cli_queue.tag_limits`:

```json
{
"cli_queue": {
"tag_limits": {
"default": { "max_concurrent": 10 },
"user:tag/deploy.md": { "max_concurrent": 1 },
"user:tag/sync.md": { "max_concurrent": 5 }
}
}
}
```

Tags not explicitly configured use the default limit.

### Release

After job completion (success or failure), the worker removes the job ID from all tag Sets using a Redis pipeline. This runs in a `finally` block to guarantee cleanup.

## Execution Modes

### Host Mode (Default)

Spawns a shell process directly on the host machine:

- Uses `child_process.spawn` with `shell: true` and `detached: true`
- Process group detachment enables reliable cleanup of child processes
- Environment inherits from PM2 worker with `FORCE_COLOR=0`

### Container Mode

Executes via `docker exec` inside the running Docker container:

- Translates host paths to container paths (`$USER_BASE_DIRECTORY` to `$CONTAINER_USER_BASE_PATH`)
- Runs as `node` user inside the container
- Uses process group detachment for cleanup

## Timeout Handling

1. Timer starts when command spawns
2. On timeout: send SIGTERM to entire process group
3. After 5-second grace period: send SIGKILL if still running
4. Job result includes `timed_out: true`

Default timeout: 5 minutes (300,000 ms). Override per-job via `timeout_ms`.

## Command Validation

The `validate_queued_command()` function allows:

- Environment variables (`$VAR` and `\${VAR}`)
- Chain operators (`&&`)
- Prevents dangerous shell metacharacters (`|`, `<`, `>`, `;`, backticks)

## CLI Interface

All commands are under `base queue`:

```bash

# Queue a command

base queue add "yarn test" --tags test,ci --priority 5 --timeout 600000

# Check job status

base queue status <job-id>

# View queue statistics

base queue stats
base queue stats --json
```

## Worker Configuration

The `cli-queue-worker` PM2 service processes jobs with these settings:

- **Concurrency**: 10 maximum simultaneous jobs (actual limit enforced by tag system)
- **Stalled job detection**: Every 30 seconds
- **Lock duration**: 5 minutes with auto-renewal at 150 seconds
- **Max stalls**: 2 before job fails

## Monitoring

### Queue Statistics

`base queue stats` returns:

| Metric    | Description                              |
| --------- | ---------------------------------------- |
| waiting   | Jobs queued, not yet picked up           |
| active    | Currently executing                      |
| completed | Finished successfully (retained 1 hour)  |
| failed    | Failed after retries (retained 24 hours) |

### Job Status

`base queue status <job-id>` returns job state, input data, execution result, failure reason, and attempt count.

### Debug Logging

```bash
DEBUG=cli-queue:\* pm2 restart cli-queue-worker
pm2 logs cli-queue-worker
```

Namespaces: `cli-queue:queue`, `cli-queue:executor`, `cli-queue:tag-limiter`, `cli-queue:worker`, `cli-queue:service`.

## Key Modules

| Module                                        | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `libs-server/cli-queue/queue.mjs`           | Job creation, status queries, queue stats    |
| `libs-server/cli-queue/tag-limiter.mjs`     | Lua-based atomic tag acquisition and release |
| `libs-server/cli-queue/execute-command.mjs` | Host and container command execution         |
| `libs-server/cli-queue/worker.mjs`          | BullMQ worker with event handling            |
| `cli/base/queue.mjs`                        | CLI command interface                        |
| `server/services/cli-queue-worker.mjs`      | PM2 service entry point                      |
