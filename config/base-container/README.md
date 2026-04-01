# Base Container

Persistent Docker container providing Claude Code CLI, OpenCode CLI, and development tooling for interactive sessions. Services (base-api, schedule-processor, cli-queue-worker, metadata-queue-processor, transcription-service) run natively via PM2 for filesystem performance.

## Prerequisites

- **Primary machine (macOS)**: Docker Desktop for macOS, Node.js 20+, PM2 (`bun install -g pm2`)
- **Secondary machine (Linux)**: Docker Engine (user in `docker` group), Node.js 20+, PM2
- `CONFIG_ENCRYPTION_KEY` environment variable set in shell profile (required for base CLI)

## File Structure

```
config/base-container/
  Dockerfile                  # Container image (Claude Code, OpenCode, dev tools)
  docker-compose.yml          # Base compose (interactive container only)
  docker-compose.storage.yml  # Storage server overrides
  docker-compose.macbook.yml  # MacBook overrides
  entrypoint.sh               # Container initialization
  config.storage.env          # Per-machine env for container hooks
  config.macbook.env          # Per-machine env for container hooks

repository/active/base/
  pm2.config.js               # Unified PM2 config for all 5 services (auto-detects machine)
```

## Service Management (PM2)

Services run natively on the host via PM2 for direct filesystem access:

```bash
# Start all services
cli/base-container.sh start

# Start a specific service
cli/base-container.sh start base-api

# View status
cli/base-container.sh status

# View logs
cli/base-container.sh logs base-api

# Initial setup (start + save for boot persistence)
cli/base-container.sh setup
pm2 startup  # follow printed instructions
```

## Interactive Container (Docker)

The Docker container is used for Claude Code and OpenCode CLI sessions:

```bash
# Build and start the container
cli/base-container.sh build
cli/base-container.sh container-start

# Access container shell
cli/base-container.sh shell

# Run Claude Code
cli/base-container.sh claude

# Run OpenCode
cli/base-container.sh opencode

# Stop container
cli/base-container.sh container-stop
```

## Data Directories

Each machine has a local data directory for persistent `~/.claude` and `~/.opencode` state (not version controlled, not synced):

| Machine        | Path                            |
| -------------- | ------------------------------- |
| Linux server | Configurable (e.g., `/data/base-container-data/`) |
| macOS        | `$HOME/.base-container-data/`                     |

One-time setup:

```bash
# Linux server (adjust path as needed)
mkdir -p $DATA_DIR/base-container-data/{claude-home/projects,opencode-data}
chown -R $USER:$USER $DATA_DIR/base-container-data

# macOS
mkdir -p $HOME/.base-container-data/{claude-home/projects,opencode-data}
```

On first container start, the entrypoint automatically:

- Creates `todos/` and `plans/` subdirectories in claude-home
- Initializes `settings.json` from the template at `config/base-container/settings.container.json`

To use custom settings in the container, either:

- Edit `settings.container.json` (applies to new containers)
- Manually edit `~/.base-container-data/claude-home/settings.json` (applies immediately)

## Session Sync (Cross-Machine Resume)

Primary synchronization happens through git in the `thread/` submodule:

1. Session hooks convert/update thread data under `thread/<thread_id>/raw-data/`
2. `push-threads.sh` syncs local thread changes to remote storage
3. `pull-threads.sh` syncs remote thread changes to other machines

This is the normal cross-machine continuity path and includes session raw-data
needed for restore on resume.

`sync-sessions` is a manual recovery tool only. Use it only when JSONL files are
missing from container `~/.claude/projects` and you need to repopulate that cache:

```bash
# Manual recovery: sync session JSONL files to storage server container data
cli/base-container.sh sync-sessions
```

Only session JSONL files should be synced with `sync-sessions`. Settings, cache,
todos, plans, and statsig are container-owned and must not be synced.

## Per-Machine Differences

| Aspect             | Linux Server                     | macOS                                             |
| ------------------ | -------------------------------- | ------------------------------------------------- |
| Container network  | `host` (localhost reaches host)  | Bridge (`host.docker.internal`)                   |
| Thread rsync       | Skipped (`SKIP_THREAD_RSYNC=1`)  | Required (syncs via SSH)                          |
| SSH config         | Mounted from `~/.ssh`            | Mounted from host `~/.ssh`                        |
| SSH agent          | Not used                         | Proxied via socat (auto-configured by entrypoint) |
| PM2 log directory  | `~/logs/`                        | `~/logs/`                                         |
| Machine identifier | `BASE_CONTAINER_MACHINE=storage` | `BASE_CONTAINER_MACHINE=macbook`                  |

## Container Context for Claude Code

The entrypoint generates a context file at `/tmp/container-context.txt` that describes the container environment. When using `cli/base-container.sh claude`, this context is automatically appended to the Claude Code system prompt via `--append-system-prompt-file`.

The context includes:

- Which machine the container is running on (storage or macbook)
- Network mode and service accessibility
- SSH host configuration availability

## Troubleshooting

**PM2 services not starting**: Ensure `bun install` has been run in `repository/active/base/`.

**Git operations fail inside container**: Check `git config user.name` and `git config user.email` are set. The entrypoint configures these from env vars.

**SSH operations fail (MacBook)**: Verify `~/.ssh` is mounted by checking `ls /home/node/.ssh/` inside the container. If you get a passphrase prompt, ensure the host's ssh-agent has keys loaded (`ssh-add -l` on host). The container entrypoint creates a socat proxy to forward the ssh-agent socket with correct permissions.

**SSH host aliases not working**: The host's SSH config is mounted read-only with root ownership. The entrypoint copies the config to a node-owned directory (`/home/node/.ssh-local`) and symlinks `/home/node/.ssh` to it. If `ssh storage` fails with "Could not resolve hostname", restart the container to trigger the entrypoint SSH setup.

**Hook scripts fail with "command not found"**: Ensure base submodule dependencies are installed. The entrypoint installs them on first boot, but you can manually run `cd $USER_BASE_DIRECTORY/repository/active/base && bun install`.

**Submodule operations fail (storage server)**: Ensure `git config --global protocol.file.allow always` is set (done by entrypoint).
