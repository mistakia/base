# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Human-in-the-Loop System - an LLM-powered knowledge base management and collaboration platform. The system uses a file-first architecture with markdown/YAML files as the primary data format and git for version control.

**User Directory Configuration**: The user data directory is external to the main repository and configured via `config.user_base_directory`. This allows the user data to exist as a separate git repository outside the Base system.

## Common Development Commands

### Development

```bash
# Run full development environment (frontend + API)
yarn dev

# Run only frontend dev server (port 8090)
yarn start

# Run only API server
yarn start:api
```

### Testing

```bash
# Run all tests (unit + integration)
yarn test:all

# Run tests with minimal output (more token efficient)
yarn test:all --reporter min

# Run specific test suites
yarn test:unit          # Unit tests only
yarn test:integration   # Integration tests only
yarn test:api          # API tests
yarn test:threads      # Thread system tests
yarn test:git          # Git operations tests
yarn test:markdown     # Markdown processing tests
yarn test:sync         # Synchronization tests

# Run a single test file
yarn test:file ./tests/unit/path/to/test.mjs

# Run a single test
yarn test -- --grep "test name"
```

### Code Quality

```bash
# Run ESLint
yarn lint

# Run Prettier formatter
yarn prettier
```

### File-First Architecture

The system operates with a file-first architecture where all data is stored as markdown files with YAML frontmatter in the filesystem. No database dependencies are required for operation.

## Architecture Overview

### Three-Tier Architecture

1. **Client**: React SPA with Redux state management (`/client`)
2. **Server**: Express.js API with WebSocket support (`/server`)
3. **Data**: Git repositories with file-based storage

### Key Architectural Concepts

#### Entity System

Everything is an entity with a type (task, workflow, guideline, person, etc.). Entities have:

- Base properties (id, type, name, content)
- Type-specific extensions
- Relations forming a knowledge graph
- Multi-storage support (filesystem, git, database)

#### Thread-Workflow-Tool Model

1. **Tools**: Atomic operations (file_read, task_create, etc.) in `/libs-server/tools/`
2. **Workflows**: Compose tools into agent behaviors in markdown files
3. **Threads**: Execute workflows with state management and git worktrees

### Directory Structure

```
/client/              # React frontend
  /core/             # Redux state management
  /views/            # UI components and pages

/server/             # Express API server
  /routes/           # API endpoints

/libs-server/        # Core server libraries
  /entity/           # Entity system (CRUD, validation, storage)
  /threads/          # Thread execution engine
  /tools/            # Tool implementations
  /workflow/         # Workflow processing
  /integrations/     # External system integrations

/system/             # System knowledge base
  /schema/           # Entity type definitions
  /guideline/        # System guidelines
  /workflow/         # System workflows
  /text/            # Documentation

# User directory is external, configured via config.user_base_directory
# <user-directory>/   # User data (separate git repository)
#   /task/            # User tasks
#   /thread/          # Thread execution data
#   /workflow/        # User workflows
```

### State Management (Client)

The client uses Redux with Immutable.js:

- Core modules: entity, tasks, thread, websocket, api
- Redux-Saga for side effects
- Selectors for derived state
- WebSocket for real-time updates

### Entity Storage Strategy

Entities are stored in two layers:

1. **Filesystem**: Markdown files with YAML frontmatter as the primary storage
2. **Git**: Version control and change tracking

All operations work directly with the filesystem, using git for version control.

### Thread Execution

Threads execute workflows in isolated git worktrees:

- Each thread gets its own branch
- Timeline tracks all actions immutably
- Memory system: transient, persistent, long-term
- Supports concurrent execution

### Integration Points

- **GitHub**: Bidirectional sync with issues and projects
- **External APIs**: Via tool system
- **Webhooks**: Real-time updates from external systems
- **Model Context Protocol**: For AI model communication

## Development Notes

- Bun 1.2+ required (runtime, package manager, and CLI shebang)
- Uses Yarn 4.2.2 for legacy compatibility (Bun is the primary package manager)
- File-first architecture with no database dependencies
- All file paths use ES modules (.mjs extension)
- Test files follow pattern: `*.test.mjs`
- Debug logging available via DEBUG environment variable
- JWT authentication for API endpoints
- WebSocket for real-time client-server communication

## Configuration Architecture

The config system uses a two-tier loading strategy: base defaults + user-base overlay.

### How Config Loading Works

1. **Base defaults** (`config/config.json`): Always loaded first. Contains only non-secret default values with empty strings for credentials. This is the installable system config -- anyone can clone the repo and provide their own user-base config.

2. **User-base overlay** (`{USER_BASE_DIRECTORY}/config/config.json`): Loaded via `@tsmx/secure-config` (supports `ENCRYPTED|...` values) and deep-merged over defaults. Contains secrets, machine_registry, deployment-specific values.

3. **Test mode** (`NODE_ENV=test`): Uses `config/config-test.json` directly via `secure_config`, bypassing the merge.

### Required Environment Variables

- `USER_BASE_DIRECTORY` -- Path to user-base working directory (required outside test mode)
- `CONFIG_ENCRYPTION_KEY` -- Decryption key for `ENCRYPTED|...` values in user-base config

### Machine Identity

Machine-specific configuration (SSL, ports, transcription args) is resolved via `machine_registry` in the user-base config. The `pm2.config.js` reads machine_registry directly from user-base config.json to set environment variables before services start.

### Env Var Injection

`pm2.config.js` auto-detects the current machine by matching `os.hostname()` against `machine_registry` entries and injects machine-specific env vars (SSL_ENABLED, SSL_KEY_PATH, SSL_CERT_PATH, SERVER_PORT).

### Core vs Extension Boundary

The base repo is the generic engine. It must not contain user-specific values
(paths, IPs, repo names, addresses, git identity). All customization lives in
the user-base directory using the same two-layer pattern established for config,
workflows, and guidelines:

- Config: base `config/config.json` provides defaults, user-base overlays
- Workflows: base `system/workflow/` provides core, user-base `workflow/` extends
- Guidelines: base `system/guideline/` provides core, user-base `guideline/` extends
- CLI scripts: base `cli/` provides core tools, user-base `cli/` adds user scripts
- Extensions: user-base `extension/` provides convention-based CLI extensions
- Container config: base provides generic Dockerfile/compose, user-base overrides per machine
- Deployment config: user-base `config/` holds `deploy-hooks.conf`, `labels.mjs`, etc.

When adding functionality: would another user need this exact value? If not,
it belongs in user-base.

## Extension System

The extension system enables convention-based CLI subcommand registration and agent skill discovery. Extensions are directories in `{USER_BASE_DIRECTORY}/extension/` that contribute commands and skills without modifying core code.

### Discovery and Registration

At startup, `base.mjs` scans extension directories for `command.mjs` files and dynamically registers them as CLI subcommands. Discovery order (first-match-wins): user extensions, then system extensions.

### Extension Structure

```
extension/
  <name>/
    extension.md     # Manifest (entity frontmatter + docs)
    command.mjs      # Yargs command module (optional)
    skill/           # Agent skills in workflow format (optional)
    SKILL.md         # Consensus spec skill (optional)
    lib/             # Supporting code (optional)
```

### CLI Commands

```bash
base extension list          # Show registered extensions
base extension list --json   # JSON output with full metadata
base skill list              # Show all discovered skills
base skill list --json       # JSON output
```

### Core Modules

- `libs-server/extension/discover-extensions.mjs` -- Extension discovery logic
- `libs-server/extension/discover-skills.mjs` -- Skill discovery from extensions and workflows
- `cli/base/extension.mjs` -- `base extension` CLI command
- `cli/base/skill.mjs` -- `base skill` CLI command

### Schemas

- `system/schema/extension.md` -- Extension entity type definition
- `system/schema/skill.md` -- Skill entity type definition

### Documentation

- `system/text/extension-system.md` -- Full extension system documentation

### Debug Logging

Enable config loader debug output: `DEBUG=config:loader node ...`

## Naming Conventions

- **Directory Names**: Use singular nouns for directory names (e.g., `directory/`, `entity/`, `task/` not `directories/`, `entities/`, `tasks/`)
- **File Names**: Use kebab-case for multi-word files (e.g., `file-display-page.js`)
- **Component Names**: Use PascalCase for React components
- **Variable Names**: Use snake_case for variables and function names
- **CSS Classes**: Use BEM methodology with kebab-case

## CLI Tools

The `cli/` directory contains utilities for managing entities and validating the knowledge base. The unified `base` CLI is the preferred entry point for most operations.

### Unified Base CLI (Preferred)

```bash
# Entity operations
base entity list -t task --status "In Progress"
base entity list -t task --json
base entity get "user:task/my-task.md"
base entity update "user:task/my-task.md" --status "Completed" --priority High
base entity update "user:task/my-task.md" --status "In Progress" --dry-run
base entity observe "user:task/my-task.md" "[category] observation text"
base entity tree "user:task/my-task.md"                    # Single task dependency tree
base entity tree "user:task/my-task.md" -r blocked_by,blocks  # Filter by relation type
base entity tree "user:task/my-task.md" -s "In Progress,Planned"  # Filter by status
base entity tree --project "user:tag/base-project.md"      # Project-wide dependency graph
base entity move task/old.md task/new.md --dry-run
base entity validate

# Relation management
base relation list "user:task/my-task.md"
base relation forward "user:task/my-task.md"
base relation reverse "user:task/my-task.md" --json
base relation add "user:task/a.md" blocked_by "user:task/b.md"
base relation add "user:task/a.md" relates "user:task/b.md" --dry-run
base relation remove "user:task/a.md" blocked_by "user:task/b.md"
base relation remove "user:task/a.md" relates "user:task/b.md" --dry-run

# Tag management
base tag list
base tag stats --below-threshold 15
base tag add -t javascript -i "task/*.md"
base tag remove -t legacy -i "**/*.md" --dry-run

# Thread operations
base thread list --state active
base thread messages <thread-id> --role user --last 5      # Formatted conversation messages
base thread messages <thread-id> --role assistant --first 3 --json
base thread stale --days 7                                 # List active threads with no recent activity
base thread stale --days 14 --json
base thread archive <thread-id> --completed
base thread archive <thread-id> --reactivate
base thread analyze <thread-id> --dry-run

# Search
base search "feature request" --limit 10

# Command queue
base queue add "yarn test" --tags test,ci --priority 5
base queue status <job-id>
base queue stats

# Global options: --json, --verbose / -v
```

### Validation and Maintenance

```bash
# Validate all markdown entities against schemas
bun cli/validate-filesystem-markdown.mjs /path/to/user-base
bun cli/validate-filesystem-markdown.mjs --exclude_path_patterns "thread/**" /path/to/user-base

# Fix missing required fields (entity_id, user_public_key, timestamps)
bun cli/update-entity-fields.mjs                    # Apply fixes
bun cli/update-entity-fields.mjs --dry_run          # Preview changes
bun cli/update-entity-fields.mjs --include_path_patterns "task/*.md"
```

### Entity Management

```bash
# Move entity and update all references
bun cli/move-entity.mjs task/old-name.md task/new-name.md
bun cli/move-entity.mjs user:task/old.md user:task/subdir/new.md --dry_run

# Batch add/remove tags from entities
bun cli/manage-tags.mjs add -t javascript -i "task/*.md"
bun cli/manage-tags.mjs remove -t legacy -i "**/*.md" --dry_run
```

### Thread Management

```bash
# Archive or reactivate threads
bun cli/archive-thread.mjs --thread-id abc123 --completed
bun cli/archive-thread.mjs --thread-id abc123 --reactivate

# Rebuild embedded database index
bun cli/rebuild-embedded-index.mjs

# Analyze thread for metadata updates (title, relations)
bun cli/analyze-thread-metadata.mjs <thread-id> --dry-run

# Queue threads for batch metadata analysis (processed by metadata-queue-processor)
echo "<thread-id>" >> /tmp/claude-pending-metadata-analysis.queue

# Monitor metadata queue processing
cat /tmp/claude-pending-metadata-analysis.queue   # View pending
cat /tmp/claude-metadata-processed.log            # View processed

# Analyze thread relations (entity references from timeline)
bun cli/analyze-thread-relations.mjs --thread-id <uuid>
```

### CLI Command Queue

Queue CLI commands for background execution with tag-based concurrency control.
Tags allow limiting how many commands of a certain type run simultaneously
(e.g., max 5 concurrent claude-session commands).

```bash
# Queue a command for background execution
bun cli/queue-command.mjs "yarn test" --tags test,ci --priority 5

# Queue with specific working directory
bun cli/queue-command.mjs "bun script.mjs" --tags claude-session --cwd ~/project

# Check job status
bun cli/queue-command.mjs status <job-id>

# View queue statistics
bun cli/queue-command.mjs stats
```

Tag concurrency limits are configured in `config.json` under `cli_queue.tag_limits`.
The worker service runs via PM2 (`cli-queue-worker`).

### Scheduled Commands

Schedule CLI commands for automated execution at specified times. Schedules are stored as entities in the user-base `scheduled-command/` directory and processed by the `schedule-processor` PM2 service.

```bash
# List all scheduled commands
base schedule list
base schedule list --jobs              # Enrich with job execution status

# Create a new scheduled command
base schedule add "yarn test:all" --type expr --schedule "0 2 * * *" --title "Nightly tests"

# Schedule types:
#   expr  - Cron expression (e.g., "0 2 * * *")
#   at    - One-shot ISO timestamp (e.g., "2026-03-01T14:00:00Z")
#   every - Recurring interval (e.g., "6h", "30m", "1d")

# Enable/disable schedules
base schedule enable base/run-tests.md
base schedule disable base/run-tests.md

# Force immediate execution
base schedule trigger base/run-tests.md

# Delete a schedule
base schedule delete base/run-tests.md
```

The schedule-processor service polls every 60 seconds and enqueues due commands to the CLI queue. Manage the service via PM2:

```bash
pm2 start schedule-processor   # Start the processor
pm2 stop schedule-processor    # Stop the processor
pm2 logs schedule-processor    # View logs
```

### Job Tracker

Unified job tracking for both internal scheduled-command executions and external cron jobs. Stores execution results as JSON files at the configured `job_tracker.path`.

**Configuration** (`job_tracker` in config):

- `enabled` - Enable/disable job tracking
- `path` - Job file directory path
- `ssh_host` - SSH host alias for remote reads
- `api_key` - Bearer token for external job reporting
- `discord_webhook_url` - Discord webhook for failure/missed alerts
- `missed_check_interval_ms` - Missed execution check interval

**Internal jobs** are auto-reported by the CLI queue worker when `metadata.schedule_entity_id` is present. Job ID format: `internal-{schedule-entity-uuid}`.

**External jobs** report via HTTP API. Job ID format: `{project}-{script-name}`.

**HTTP API**:

- `POST /api/jobs/report` - Report job execution (API key auth via Bearer header)
- `GET /api/jobs` - List all tracked jobs
- `GET /api/jobs/:job_id` - Get specific job details

**CLI commands**:

```bash
base job list                # List all tracked jobs
base job list --json         # JSON output
base job get <job_id>        # Get job details
base job check-missed        # Check for missed executions
```

**Job wrapper** (`scripts/job-wrapper.sh`): Bash wrapper for external cron commands that captures exit code, duration, and stderr, then reports to the API. Environment variables: `JOB_API_URL`, `JOB_API_KEY`, `JOB_PROJECT`, `JOB_SCHEDULE`, `JOB_SCHEDULE_TYPE`.

**Core modules** in `libs-server/jobs/`:

- `report-job.mjs` - Job reporting, loading, saving (atomic writes)
- `check-missed-jobs.mjs` - Missed execution detection with grace periods

**Crontab build preprocessor** (`base crontab build`): Thin shim that delegates to `build-crontab` (pure bash/awk script from the bootstrap repo, deployed to `~/bin/`). Reads a crontab source file and produces a deploy-ready crontab on stdout. Auto-injects `JOB_SCHEDULE` and `JOB_SCHEDULE_TYPE=expr` from cron timing fields. Strips `JOB_API_URL`, `JOB_API_KEY`, and standalone `JOB_SCHEDULE_TYPE` lines. Idempotent. Typical deploy pattern: process source files, copy built `.cron` files to `~/crontab/` on the target server, then run `load_crontab_files` to rebuild the active crontab from all files in that directory.

```bash
# Build and deploy crontab files to a remote server
base crontab build server/crontab.cron > /tmp/crontab.cron
scp /tmp/crontab.cron <host>:~/crontab/
ssh <host> 'load_crontab_files'
```

**Credential distribution for external jobs**: `JOB_API_URL` and `JOB_API_KEY` are set outside crontab files so the preprocessor can strip them from source. Set these environment variables on each server (e.g., via `/etc/environment`, a crontab env file, or shell profile). The server running the API uses `JOB_API_URL=https://localhost:<port>`; remote servers use the API server's hostname.

### External Session Import

```bash
# Import Claude Code sessions as threads
bun cli/convert-external-sessions.mjs list --provider claude
bun cli/convert-external-sessions.mjs import --provider claude --dry-run
bun cli/convert-external-sessions.mjs import --provider claude --session-id "uuid"

# Import Cursor conversations
bun cli/convert-external-sessions.mjs import --provider cursor --from-date "2025-01-01"

# Validate session files without importing
bun cli/convert-external-sessions.mjs validate --provider claude --verbose
```

### Entity Visibility

```bash
# Manage entity public_read visibility
base entity visibility set "task/**/*.md" true
base entity visibility set "task/**/*.md" true --dry-run
base entity visibility set "/absolute/path/to/entity.md" false
base entity visibility get "task/**/*.md"
base entity visibility get "/absolute/path/to/entity.md"
```

### Entity Query

```bash
# Preferred: Use unified CLI
base entity list -t task --status "In Progress"
base entity get "user:task/my-task.md"
base entity list -s "feature" -t task --json

# Direct alternatives (when unified CLI is not available)
bun cli/entity-list.mjs -t task --status "In Progress"
```

## Git Workflow Rules

**Use feature branches for non-trivial changes (default behavior):**

- For feature development, refactoring, or multi-file changes, use worktrees:
  `git worktree add -b feature/description ../base-worktrees/feature-description`
- Merge feature branches to main when ready, then clean up the worktree
- Small changes (documentation, single-file fixes) can be committed directly to main
- Avoid force pushes to main that would disrupt other developers
- **Workflow override**: When following an implementation workflow (e.g., implement-general-task, implement-software-task), the workflow's environment setup instructions take precedence over these defaults. Only create worktrees if the workflow explicitly prescribes them.

**Never discard uncommitted changes you did not author:**

- Do not run `git restore`, `git checkout -- <file>`, `git clean`, or any command that discards working tree changes unless you have verified those changes were made by the current session
- In multi-session environments, uncommitted changes may belong to another concurrent agent session or to manual user edits -- discarding them causes silent data loss
- Treat uncommitted changes as potentially valuable work, not dirty state to clean up
- If unknown uncommitted changes block your work, stash them, use a worktree, or ask the user
