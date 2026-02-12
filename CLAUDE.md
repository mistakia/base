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

# Run only frontend dev server (port 8081)
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

- Node.js 18+ required
- Uses Yarn 4.2.2 for package management
- File-first architecture with no database dependencies
- All file paths use ES modules (.mjs extension)
- Test files follow pattern: `*.test.mjs`
- Debug logging available via DEBUG environment variable
- JWT authentication for API endpoints
- WebSocket for real-time client-server communication

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
base entity move task/old.md task/new.md --dry-run
base entity validate

# Relation lookups
base relation list "user:task/my-task.md"
base relation forward "user:task/my-task.md"
base relation reverse "user:task/my-task.md" --json

# Tag management
base tag list
base tag stats --below-threshold 15
base tag add -t javascript -i "task/*.md"
base tag remove -t legacy -i "**/*.md" --dry-run

# Thread operations
base thread list --state active
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
node cli/validate-filesystem-markdown.mjs /path/to/user-base
node cli/validate-filesystem-markdown.mjs --exclude_path_patterns "thread/**" /path/to/user-base

# Fix missing required fields (entity_id, user_public_key, timestamps)
node cli/update-entity-fields.mjs                    # Apply fixes
node cli/update-entity-fields.mjs --dry_run          # Preview changes
node cli/update-entity-fields.mjs --include_path_patterns "task/*.md"
```

### Entity Management

```bash
# Move entity and update all references
node cli/move-entity.mjs task/old-name.md task/new-name.md
node cli/move-entity.mjs user:task/old.md user:task/subdir/new.md --dry_run

# Batch add/remove tags from entities
node cli/manage-tags.mjs add -t javascript -i "task/*.md"
node cli/manage-tags.mjs remove -t legacy -i "**/*.md" --dry_run
```

### Thread Management

```bash
# Archive or reactivate threads
node cli/archive-thread.mjs --thread-id abc123 --completed
node cli/archive-thread.mjs --thread-id abc123 --reactivate

# Rebuild embedded database index
node cli/rebuild-embedded-index.mjs

# Analyze thread for metadata updates (title, relations)
node cli/analyze-thread-metadata.mjs <thread-id> --dry-run

# Queue threads for batch metadata analysis (processed by metadata-queue-processor)
echo "<thread-id>" >> /tmp/claude-pending-metadata-analysis.queue

# Monitor metadata queue processing
cat /tmp/claude-pending-metadata-analysis.queue   # View pending
cat /tmp/claude-metadata-processed.log            # View processed

# Analyze thread relations (entity references from timeline)
node cli/analyze-thread-relations.mjs --thread-id <uuid>
```

### CLI Command Queue

Queue CLI commands for background execution with tag-based concurrency control.
Tags allow limiting how many commands of a certain type run simultaneously
(e.g., max 5 concurrent claude-session commands).

```bash
# Queue a command for background execution
node cli/queue-command.mjs "yarn test" --tags test,ci --priority 5

# Queue with specific working directory
node cli/queue-command.mjs "node script.mjs" --tags claude-session --cwd ~/project

# Check job status
node cli/queue-command.mjs status <job-id>

# View queue statistics
node cli/queue-command.mjs stats
```

Tag concurrency limits are configured in `config.json` under `cli_queue.tag_limits`.
The worker service runs via PM2 (`cli-queue-worker`).

### Scheduled Commands

Schedule CLI commands for automated execution at specified times. Schedules are stored as entities in the user-base `scheduled-command/` directory and processed by the `schedule-processor` PM2 service.

```bash
# List all scheduled commands
base schedule list

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

### External Session Import

```bash
# Import Claude Code sessions as threads
node cli/convert-external-sessions.mjs list --provider claude
node cli/convert-external-sessions.mjs import --provider claude --dry-run
node cli/convert-external-sessions.mjs import --provider claude --session-id "uuid"

# Import Cursor conversations
node cli/convert-external-sessions.mjs import --provider cursor --from-date "2025-01-01"

# Validate session files without importing
node cli/convert-external-sessions.mjs validate --provider claude --verbose
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
node cli/entity-list.mjs -t task --status "In Progress"
```

### GitHub Integration

```bash
# Create GitHub issues from local task entities
node cli/github/create-github-issues-from-local-tasks.mjs

# Import GitHub issues into local entities
node cli/github/import-github-issues.mjs
node cli/github/import-github-project-issues.mjs

# Create GitHub labels from tag entities
node cli/github/create-github-labels.mjs
```

### Notion Integration

```bash
# Sync Notion databases to local entities
node cli/notion/sync-notion-entities.mjs

# Clean up orphaned Notion entity files
node cli/notion/cleanup-notion-entities.mjs
```

## Git Workflow Rules

**Use feature branches for non-trivial changes:**

- For feature development, refactoring, or multi-file changes, use worktrees:
  `git worktree add -b feature/description ../base-worktrees/feature-description`
- Merge feature branches to main when ready, then clean up the worktree
- Small changes (documentation, single-file fixes) can be committed directly to main
- Avoid force pushes to main that would disrupt other developers
