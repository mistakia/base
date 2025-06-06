# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Human-in-the-Loop System - an LLM-powered knowledge base management and collaboration platform. The system uses a file-first architecture with markdown/YAML files as the primary data format, git for version control, and PostgreSQL for indexing and search.

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
yarn test

# Run specific test suites
yarn test:unit          # Unit tests only
yarn test:integration   # Integration tests only
yarn test:api          # API tests
yarn test:threads      # Thread system tests
yarn test:git          # Git operations tests
yarn test:blocks       # Block system tests

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

### Database Operations

```bash
# Export production schema
yarn export:schema

# Database setup is automatic in tests
# Schema file: db/schema.sql
```

**Schema Change Workflow:**

Preferred approach for database schema changes:

1. Run SQL ALTER commands directly on the production database
2. Export the updated schema using `yarn export:schema`
3. Do NOT commit migration files or SQL commands to the repository
4. The exported schema file (`db/schema.sql`) becomes the source of truth

## Architecture Overview

### Three-Tier Architecture

1. **Client**: React SPA with Redux state management (`/client`)
2. **Server**: Express.js API with WebSocket support (`/server`)
3. **Data**: PostgreSQL + Git repositories

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

#### Change Request Pattern

All modifications follow a pull request-style workflow:

- Changes made in feature branches
- Review and approval process
- Tracked in `/user/change-request/`

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

/user/               # User data (git submodule)
  /task/            # User tasks
  /thread/          # Thread execution data
  /workflow/        # User workflows
```

### State Management (Client)

The client uses Redux with Immutable.js:

- Core modules: entity, tasks, thread, websocket, api
- Redux-Saga for side effects
- Selectors for derived state
- WebSocket for real-time updates

### Entity Storage Strategy

Entities can be stored in three layers:

1. **Filesystem**: Markdown files with YAML frontmatter
2. **Git**: Version control and change tracking
3. **Database**: Indexing, search, and relationships

The system automatically syncs between these layers.

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
- PostgreSQL with pgvector extension for semantic search
- All file paths use ES modules (.mjs extension)
- Test files follow pattern: `*.test.mjs`
- Debug logging available via DEBUG environment variable
- JWT authentication for API endpoints
- WebSocket for real-time client-server communication
