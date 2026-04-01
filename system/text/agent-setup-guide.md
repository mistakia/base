---
title: Agent-Oriented Setup Guide
type: text
description: >-
  Self-contained setup guide for installing and configuring the Base system, designed to be
  fetched and executed by any AI agent or automated tool
base_uri: sys:system/text/agent-setup-guide.md
created_at: '2026-03-31T00:00:00.000Z'
entity_id: a2b3c4d5-e6f7-4890-abcd-1234567890ab
public_read: true
updated_at: '2026-03-31T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Base Setup Guide

This guide walks through installing and configuring the Base system from scratch. It is self-contained -- no prior knowledge of Base is assumed.

## What is Base?

Base is a human-in-the-loop LLM system built on file primitives. All data is stored as markdown files with YAML frontmatter, tracked in git. There is no required database.

**Core concepts:**
- **Entities**: typed markdown files (task, workflow, guideline, text, tag, etc.) with schemas and relations forming a knowledge graph
- **Two-layer architecture**: the base repo provides the generic engine; a separate user-base directory provides user-specific config, data, workflows, and extensions
- **Threads**: standardized session format for any agent runner (Claude Code, Cursor, ChatGPT, etc.)
- **Extensions**: convention-based CLI subcommands and agent skills in the user-base directory

**Content map:**
- `system/text/system-design.md` -- architecture and design principles
- `system/text/knowledge-base-schema.md` -- entity types and data models
- `system/text/extension-system.md` -- CLI extensions and agent skills
- `system/text/configuration-system.md` -- two-tier config and machine registry
- `system/text/background-services.md` -- PM2 services and scheduling
- `CLAUDE.md` -- full project context for Claude Code sessions

## Prerequisites

Install these before proceeding. Each includes a verification command.

### git

```bash
git --version
# Expected: git version 2.x.x
```

### ripgrep

```bash
rg --version
# Expected: ripgrep 14.x.x (any version works)
```

Install: `brew install ripgrep` (macOS), `apt install ripgrep` (Debian/Ubuntu), or see [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases).

### Redis (optional)

```bash
redis-cli ping
# Expected: PONG
```

Redis enables job queuing (BullMQ) and scheduling. Without Redis, the CLI and entity system work fully -- only background job processing is unavailable.

## Installation

### Step 1: Install the Base CLI

```bash
curl -fsSL https://base.tint.space/install.sh | bash
```

This downloads a compiled binary to `~/.base/bin/base`, adds it to your PATH, and runs `base init` to create a user-base directory.

**Success**: `base --version` prints the installed version.

Alternatively, install from source (for development):

```bash
git clone https://github.com/mistakia/base.git
cd base
bun install
# Use: bun cli/base.mjs <command>
```

### Step 2: Initialize a user-base directory

If the installer did not already run init:

```bash
base init --user-base-directory ~/user-base
```

**Success**: output lists 18 created directories and 23 created files including `CLAUDE.md`, `AGENTS.md`, `config/config.json`, and `.gitignore`.

This creates the user-base directory structure:
```
~/user-base/
  task/           # Task entities
  workflow/       # Workflow entities
  guideline/      # Guidelines
  text/           # Documentation
  tag/            # Tags for categorization
  config/         # User config overlay
  cli/            # User-specific scripts
  extension/      # CLI extensions (create manually when needed)
  thread/         # Session execution data
  ...             # Other entity type directories
```

### Step 4: Set the environment variable

```bash
export USER_BASE_DIRECTORY=~/user-base
```

Add this to your shell profile (`.bashrc`, `.zshrc`, or `.bash_profile`) for persistence. The `base setup env` command can do this automatically:

```bash
base setup env --user-base-dir ~/user-base
```

**Success**: `echo $USER_BASE_DIRECTORY` prints the path to your user-base directory.

### Step 5: Create your first entity

```bash
base entity create "user:task/hello-world.md" --type task --title "Hello World" --description "My first task"
```

**Success**: output confirms the entity was created. The file `~/user-base/task/hello-world.md` exists with YAML frontmatter.

### Step 6: Verify the installation

```bash
# List entities
base entity list -t task
# Expected: shows hello-world.md

# Search
base search "hello"
# Expected: shows the hello-world task

# Check all commands
base --help
# Expected: lists available commands (entity, thread, search, tag, relation, etc.)
```

## What You Just Installed

The Base system has three layers:

1. **Base repo** (this repository): the generic engine with CLI tools, entity system, schemas, workflows, API server, and background services. This is shared infrastructure that does not contain user-specific data.

2. **User-base directory** (created by `base init`): your personal knowledge base. This contains your entities (tasks, workflows, guidelines, etc.), config overlays, CLI extensions, and session data. This directory is a separate git repository.

3. **Background services** (optional): PM2-managed processes for the API server, file watchers, job queue workers, and scheduled commands. These are needed for the web UI, real-time sync, and automation -- not required for CLI-only usage.

### Architecture at a glance

```
base repo (engine)              user-base directory (your data)
  cli/           CLI tools        task/          Your tasks
  server/        API server       workflow/      Your workflows
  client/        Web UI           guideline/     Your guidelines
  system/        Schemas,         config/        Your config overlay
                 workflows,       extension/     Your CLI extensions
                 guidelines       thread/        Session data
  libs-server/   Core libraries   cli/           Your scripts
```

The two-layer pattern means: base repo provides defaults, user-base overrides. This applies to config, workflows, guidelines, and CLI scripts.

## Optional: Background Services

For the web UI, real-time file watching, job queuing, and scheduled commands, start the PM2 services:

```bash
# Install PM2 globally
npm install -g pm2

# Start all services
pm2 start pm2.config.js

# Check status
pm2 status
# Expected: base-api, cli-queue-worker, schedule-processor online
# metadata-queue-processor and transcription-service are optional
```

**Success**: `pm2 status` shows services as "online". The API responds at `http://localhost:8080/api/health`.

### Web UI

After starting services:

```bash
# Build the frontend
yarn build

# Visit http://localhost:8080 in your browser
```

## Optional: Docker Container Setup

For isolated agent sessions in Docker containers:

```bash
# Build the container
cd config/base-container
docker compose build

# Create a machine-specific overlay (see config/base-container/README.md)
# Start the container
docker compose -f docker-compose.yml -f /path/to/your-overlay.yml up -d
```

See `config/base-container/README.md` for detailed container configuration.

## Optional: Multi-Machine Setup

Base supports running across multiple machines with git-based sync. This requires:

1. A `machine_registry` in your user-base `config/config.json` mapping hostnames to machine-specific settings (SSL, ports, services)
2. SSH access between machines
3. Bare git repositories on the sync target for submodules (thread, import-history)

This is an advanced configuration. Start with a single machine and add multi-machine support later.

## Connecting an AI Assistant

### Claude Code

Run `claude` in the user-base directory. The generated `CLAUDE.md` provides context about the project structure and available commands.

```bash
cd ~/user-base
claude
```

### Other Agents

Any agent that reads `CLAUDE.md` or `AGENTS.md` from the project root will get context about the Base system. The entity system is accessible via the `base` CLI which works from any terminal.

## Troubleshooting

### `base: command not found`

If installed via curl, ensure `~/.base/bin` is on your PATH:
```bash
export PATH="$HOME/.base/bin:$PATH"
```

If running from source, use `bun cli/base.mjs` directly.

### `USER_BASE_DIRECTORY is not set`

Set the environment variable: `export USER_BASE_DIRECTORY=~/user-base`

Run `base setup env` to configure this permanently in your shell profile.

### `ripgrep not found` during `base init`

Install ripgrep (see Prerequisites above) or use `base init --force` to skip prerequisite checks. Search functionality requires ripgrep.

### bun install shows warnings

Warnings about optional native modules (duckdb) are non-fatal. The core CLI works without them. DuckDB is an optional storage backend; the default embedded index uses SQLite (built into Bun).

### Redis connection errors

If Redis is not running, you will see connection error warnings in PM2 service logs. The CLI and entity system work without Redis. Only background job processing (BullMQ queues) requires Redis.

### PM2 services keep restarting

Check logs: `pm2 logs <service-name> --lines 50 --nostream`

Common causes:
- `USER_BASE_DIRECTORY` not set in the PM2 environment
- Missing `config/config.json` in user-base directory
- Port already in use (default 8080)
