#!/usr/bin/env node

/**
 * Idempotent user-base initialization.
 *
 * Creates the standard directory structure and default files for a new
 * user-base, or safely adds any missing directories/files to an existing one.
 * Never overwrites existing files.
 *
 * Usage:
 *   base init
 *   base init --user-base-directory /path/to/user-base
 *   node cli/initial-setup.mjs --user-base-directory /tmp/test-user-base
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_DIR = path.resolve(__dirname, '..')
const TEMPLATE_CONFIG_PATH = path.resolve(__dirname, '../config/config.json')

// Standard entity type directories for a user-base
const DIRECTORIES = [
  {
    name: 'task',
    description: 'Task entities organized by project subdirectories'
  },
  {
    name: 'workflow',
    description: 'Workflow entities defining automated agent behaviors'
  },
  {
    name: 'guideline',
    description: 'Guideline entities for standards and best practices'
  },
  { name: 'tag', description: 'Tag entities for taxonomy and categorization' },
  {
    name: 'text',
    description: 'Text entities for documentation and reference material'
  },
  {
    name: 'identity',
    description: 'Identity entities for user accounts and auth keys'
  },
  {
    name: 'role',
    description: 'Role entities for reusable permission rule sets'
  },
  {
    name: 'scheduled-command',
    description: 'Scheduled command entities for automated execution'
  },
  { name: 'database', description: 'Database entities and storage files' },
  { name: 'files', description: 'File storage and attachments' },
  {
    name: 'physical-item',
    description: 'Physical object and equipment entities'
  },
  {
    name: 'physical-location',
    description: 'Location and real estate entities'
  },
  { name: 'repository/active', description: 'Write-access git repositories' },
  {
    name: 'repository/archive',
    description: 'Read-only reference repositories'
  },
  { name: 'config', description: 'Configuration files' },
  { name: 'cli', description: 'User-specific CLI scripts and utilities' },
  { name: 'thread', description: 'Thread execution data' },
  {
    name: 'import-history',
    description: 'Historical data from external systems'
  }
]

const GITIGNORE_CONTENT = `# OS
.DS_Store

# Git submodule content (tracked separately)
import-history/*

# Git worktree directories
*-worktrees/

# Embedded database index (rebuildable via base rebuild embedded-index)
embedded-database-index/

# Database storage files
database/*.db
database/*.duckdb
database/*.duckdb.wal

# Secrets and local environment
*.secrets.json
.env.local
config/protected-strings.txt

# Node
node_modules/
`

function create_about_md(dir_name, description) {
  const title = dir_name
    .split('/')
    .pop()
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return `---
title: ${title}
type: directory
description: ${description}
base_uri: user:${dir_name}/ABOUT.md
---

# ${title}

${description}
`
}

function ensure_directory(base_path, dir_info, summary) {
  const dir_path = path.join(base_path, dir_info.name)
  const about_path = path.join(dir_path, 'ABOUT.md')

  if (!fs.existsSync(dir_path)) {
    fs.mkdirSync(dir_path, { recursive: true })
    summary.dirs_created.push(dir_info.name)
  } else {
    summary.dirs_existed.push(dir_info.name)
  }

  if (!fs.existsSync(about_path)) {
    fs.writeFileSync(
      about_path,
      create_about_md(dir_info.name, dir_info.description)
    )
    summary.files_created.push(`${dir_info.name}/ABOUT.md`)
  }
}

function ensure_gitignore(base_path, summary) {
  const gitignore_path = path.join(base_path, '.gitignore')
  if (!fs.existsSync(gitignore_path)) {
    fs.writeFileSync(gitignore_path, GITIGNORE_CONTENT)
    summary.files_created.push('.gitignore')
  } else {
    summary.files_existed.push('.gitignore')
  }
}

function ensure_config(base_path, summary) {
  const config_path = path.join(base_path, 'config', 'config.json')
  if (!fs.existsSync(config_path) && fs.existsSync(TEMPLATE_CONFIG_PATH)) {
    const template = fs.readFileSync(TEMPLATE_CONFIG_PATH, 'utf8')
    fs.writeFileSync(config_path, template)
    summary.files_created.push('config/config.json')
  } else if (fs.existsSync(config_path)) {
    summary.files_existed.push('config/config.json')
  }
}

function check_prerequisites() {
  const results = []

  // Node.js 18+
  const node_version = process.versions.node
  const major = parseInt(node_version.split('.')[0], 10)
  results.push({
    name: 'Node.js 18+',
    ok: major >= 18,
    detail: `v${node_version}`
  })

  // git
  try {
    const git_version = execSync('git --version', { encoding: 'utf8' }).trim()
    results.push({ name: 'git', ok: true, detail: git_version })
  } catch {
    results.push({ name: 'git', ok: false, detail: 'not found' })
  }

  // ripgrep (used by search)
  try {
    const rg_version = execSync('rg --version', { encoding: 'utf8' })
      .split('\n')[0]
      .trim()
    results.push({ name: 'ripgrep', ok: true, detail: rg_version })
  } catch {
    results.push({
      name: 'ripgrep',
      ok: false,
      detail: 'not found (install: https://github.com/BurntSushi/ripgrep)'
    })
  }

  return results
}

function ensure_git_repo(base_path, summary) {
  const git_dir = path.join(base_path, '.git')
  if (!fs.existsSync(git_dir)) {
    try {
      execSync('git init', { cwd: base_path, stdio: 'pipe' })
      summary.files_created.push('.git/ (initialized)')
    } catch {
      summary.warnings = summary.warnings || []
      summary.warnings.push('Failed to initialize git repository')
    }
  }
}

function ensure_claude_md(base_path, summary) {
  const claude_md_path = path.join(base_path, 'CLAUDE.md')
  if (!fs.existsSync(claude_md_path)) {
    const base_claude_md = path.join(BASE_DIR, 'CLAUDE.md')
    const has_base_claude = fs.existsSync(base_claude_md)

    const content = `# CLAUDE.md

This is a user-base directory for the [Base](${has_base_claude ? 'repository/active/base/' : 'https://github.com/mistakia/base'}) knowledge base system.

For project architecture, CLI reference, entity system, and development commands, see the base project CLAUDE.md:
${has_base_claude ? '- [[repository/active/base/CLAUDE.md]]' : '- See the base repository CLAUDE.md'}

## User-Base Overview

This directory contains your personal knowledge base data:
- **Entities**: markdown files with YAML frontmatter in \`task/\`, \`workflow/\`, \`text/\`, etc.
- **Config**: \`config/config.json\` overlays the base defaults with your settings
- **Extensions**: \`extension/\` for custom CLI commands and capabilities
- **CLI**: \`cli/\` for user-specific scripts

## Quick Start

\`\`\`bash
# List all entities
base entity list

# Create a task
base entity create "user:task/my-first-task.md" --type task --title "My First Task"

# Search your knowledge base
base search "query"
\`\`\`
`
    fs.writeFileSync(claude_md_path, content)
    summary.files_created.push('CLAUDE.md')
  } else {
    summary.files_existed.push('CLAUDE.md')
  }
}

function ensure_agents_md(base_path, summary) {
  const agents_md_path = path.join(base_path, 'AGENTS.md')
  if (!fs.existsSync(agents_md_path)) {
    const content = `# AGENTS.md

See [CLAUDE.md](./CLAUDE.md) for project context and conventions.
`
    fs.writeFileSync(agents_md_path, content)
    summary.files_created.push('AGENTS.md')
  } else {
    summary.files_existed.push('AGENTS.md')
  }
}

export const command = 'init'
export const describe = 'Initialize or update a user-base directory structure'

export const builder = (yargs) =>
  yargs
    .option('user-base-directory', {
      alias: 'u',
      type: 'string',
      description: 'Path to user-base directory',
      default:
        process.env.USER_BASE_DIRECTORY ||
        path.join(process.env.HOME, 'user-base')
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'Skip prerequisite checks',
      default: false
    })

export const handler = async (argv) => {
  const base_path = path.resolve(argv.userBaseDirectory)

  // Check prerequisites
  const prereqs = check_prerequisites()
  const failed_prereqs = prereqs.filter((p) => !p.ok)

  if (!argv.json) {
    console.log('Prerequisites:')
    for (const p of prereqs) {
      console.log(`  ${p.ok ? '[ok]' : '[missing]'} ${p.name}: ${p.detail}`)
    }
    console.log('')
  }

  if (failed_prereqs.length > 0 && !argv.force) {
    if (argv.json) {
      console.log(JSON.stringify({ prerequisites: prereqs, error: 'missing prerequisites' }, null, 2))
    } else {
      console.error('Missing prerequisites. Install them and retry, or use --force to skip.')
    }
    process.exitCode = 1
    return
  }

  const summary = {
    base_path,
    prerequisites: prereqs,
    dirs_created: [],
    dirs_existed: [],
    files_created: [],
    files_existed: []
  }

  if (!fs.existsSync(base_path)) {
    fs.mkdirSync(base_path, { recursive: true })
  }

  for (const dir_info of DIRECTORIES) {
    ensure_directory(base_path, dir_info, summary)
  }

  ensure_gitignore(base_path, summary)
  ensure_config(base_path, summary)
  ensure_git_repo(base_path, summary)
  ensure_claude_md(base_path, summary)
  ensure_agents_md(base_path, summary)

  if (argv.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    if (summary.dirs_created.length > 0) {
      console.log(`Created ${summary.dirs_created.length} directories:`)
      for (const d of summary.dirs_created) {
        console.log(`  + ${d}/`)
      }
    }
    if (summary.files_created.length > 0) {
      console.log(`Created ${summary.files_created.length} files:`)
      for (const f of summary.files_created) {
        console.log(`  + ${f}`)
      }
    }
    if (
      summary.dirs_created.length === 0 &&
      summary.files_created.length === 0
    ) {
      console.log('Everything up to date. No changes needed.')
    } else {
      console.log(
        `\n${summary.dirs_existed.length} directories already existed.`
      )
    }

    // Next steps
    console.log('\n--- Next Steps ---\n')
    console.log(`1. Set the environment variable:`)
    console.log(`   export USER_BASE_DIRECTORY="${base_path}"`)
    console.log('')
    console.log('2. Try your first command:')
    console.log('   base entity create "user:task/hello-world.md" --type task --title "Hello World" --description "My first task"')
    console.log('   base entity list -t task')
    console.log('')
    console.log('3. Connect an AI assistant:')
    console.log('   Claude Code: run `claude` in this directory (CLAUDE.md provides context)')
    console.log('   Other tools: AGENTS.md provides the same context')
    console.log('')
    console.log('4. Explore:')
    console.log('   base --help              # See all commands')
    console.log('   base search "query"      # Search your knowledge base')
    console.log('   base entity list         # List all entities')
  }
}

// Allow direct execution
const current_file = fileURLToPath(import.meta.url)
if (process.argv[1] === current_file) {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('user-base-directory', {
      alias: 'u',
      type: 'string',
      description: 'Path to user-base directory',
      default:
        process.env.USER_BASE_DIRECTORY ||
        path.join(process.env.HOME, 'user-base')
    })
    .option('json', {
      type: 'boolean',
      description: 'Output results as JSON',
      default: false
    })
    .help()
    .alias('help', 'h').argv

  handler(argv)
}
