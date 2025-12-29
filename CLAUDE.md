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

**Testing Guidelines**: Do not use mocks or stubs. Write tests that interact with real implementations using the actual database with proper setup/teardown.

### Code Quality

```bash
# Run ESLint
yarn lint

# Run Prettier formatter
yarn prettier
```

### Build

```bash
# Production build
yarn build
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
- All server-side files use ES modules (.mjs extension)
- Test files follow pattern: `*.test.mjs`
- Debug logging via DEBUG environment variable (e.g., `DEBUG=api:* yarn start:api`)
- JWT authentication for API endpoints
- WebSocket for real-time client-server communication

### Import Aliases

Use these namespace prefixes defined in `package.json`:

- `#server/*` - Server components
- `#config/*` - Configuration modules
- `#libs-server/*` - Server-side library functions
- `#libs-shared/*` - Shared library functions (client/server)
- `#tests/*` - Test utilities
- `#cli/*` - CLI scripts
- `#services/*` - Service entry points

### ES Module Requirements

- Local imports MUST include the `.mjs` extension explicitly
- When importing from an index file, use the full path: `#libs-server/entity/index.mjs`
- Separate external libraries from project imports with a blank line

```js
// External libraries first
import express from 'express'

// Project imports with explicit extensions
import { create_entity } from '#libs-server/entity/index.mjs'
import read_file from '#libs-server/base-files/read-file.mjs'
```

## Naming Conventions

- **Directory Names**: Use singular nouns for directory names (e.g., `directory/`, `entity/`, `task/` not `directories/`, `entities/`, `tasks/`)
- **File Names**: Use kebab-case for multi-word files (e.g., `file-display-page.js`)
- **Component Names**: Use PascalCase for React components
- **Variable Names**: Use snake_case for variables and function names
- **CSS Classes**: Use BEM methodology with kebab-case

## Git Workflow Rules

**CRITICAL: Never commit directly to `main` or `master` branches**

- ALL development work MUST be done in feature branches or worktrees
- Use the pattern: `git worktree add -b feature/description ../base-worktrees/feature-description`
- Changes MUST go through the pull request process
- Direct commits to main/master branches can break the CI/CD pipeline and disrupt other developers
