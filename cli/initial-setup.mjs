#!/usr/bin/env bun

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
 *   bun cli/initial-setup.mjs --user-base-directory /tmp/test-user-base
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'
import { ensure_raw_url, validate_raw_response } from '#libs-server/utils/raw-fetch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_DIR = process.env.SYSTEM_BASE_DIRECTORY || path.resolve(__dirname, '..')
const TEMPLATE_CONFIG_PATH = path.join(BASE_DIR, 'config', 'config.json')

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
  if (!fs.existsSync(config_path)) {
    // Try template from system base directory; fall back to minimal defaults
    // (template may be inaccessible in compiled binaries)
    let content
    if (fs.existsSync(TEMPLATE_CONFIG_PATH)) {
      content = fs.readFileSync(TEMPLATE_CONFIG_PATH, 'utf8')
    } else {
      content = JSON.stringify(
        {
          user_id: '',
          user_public_key: '',
          system_main_branch: 'main',
          user_main_branch: 'main'
        },
        null,
        2
      )
    }
    fs.writeFileSync(config_path, content)
    summary.files_created.push('config/config.json')
  } else {
    summary.files_existed.push('config/config.json')
  }
}

/**
 * Generate an owner identity with ed25519-blake2b keypair and write
 * user_public_key into the user-base config. Skips if user_public_key
 * is already set in config or if the identity file already exists.
 *
 * Config is updated before the identity file is written so that a partial
 * failure (config write succeeds, identity write fails) leaves the system
 * in a recoverable state -- re-running init will retry identity creation.
 */
function ensure_owner_identity(base_path, username, summary) {
  const config_path = path.join(base_path, 'config', 'config.json')
  const identity_path = path.join(base_path, 'identity', `${username}.md`)

  // Load config once for both the existence check and the later update
  let config_data = null
  if (fs.existsSync(config_path)) {
    try {
      config_data = JSON.parse(fs.readFileSync(config_path, 'utf8'))
    } catch {
      // config parse error -- proceed with generation
    }
  }

  // Skip if identity file exists AND config already has user_public_key.
  // If identity exists but config is missing user_public_key, repair it.
  if (fs.existsSync(identity_path)) {
    if (config_data?.user_public_key) {
      summary.files_existed.push(`identity/${username}.md`)
      return null
    }
    // Identity exists but config is missing user_public_key -- read the
    // public key from the identity file and repair config
    try {
      const identity_content = fs.readFileSync(identity_path, 'utf8')
      const match = identity_content.match(/auth_public_key:\s*(\S+)/)
      if (match && config_data) {
        config_data.user_public_key = match[1]
        fs.writeFileSync(
          config_path,
          JSON.stringify(config_data, null, 2) + '\n'
        )
        summary.config_updated = true
        summary.files_existed.push(`identity/${username}.md`)
        return null
      }
    } catch {
      // fall through to regeneration
    }
    summary.files_existed.push(`identity/${username}.md`)
    return null
  }

  // Skip if config already has a user_public_key (identity may have been
  // created externally)
  if (config_data?.user_public_key) {
    return null
  }

  // Generate keypair
  let public_key_hex
  let private_key_hex
  const private_key_seed = crypto.randomBytes(32)

  const public_key = ed25519.publicKey(private_key_seed)
  public_key_hex = public_key.toString('hex')
  private_key_hex = private_key_seed.toString('hex')

  const now = new Date().toISOString()
  const entity_id = crypto.randomUUID()

  // Update config with user_public_key FIRST so that a failure here
  // does not leave an orphaned identity file (re-run would retry).
  if (config_data) {
    try {
      config_data.user_public_key = public_key_hex
      fs.writeFileSync(config_path, JSON.stringify(config_data, null, 2) + '\n')
      summary.config_updated = true
    } catch {
      summary.warnings = summary.warnings || []
      summary.warnings.push(
        'Failed to update config/config.json with user_public_key'
      )
    }
  }

  // Write identity entity file
  const identity_content = `---
title: ${username}
type: identity
description: Owner identity for this user-base
auth_public_key: ${public_key_hex}
base_uri: user:identity/${username}.md
created_at: '${now}'
entity_id: ${entity_id}
username: ${username}
rules:
  - action: allow
    pattern: 'user:**'
  - action: allow
    pattern: 'sys:**'
permissions:
  create_threads: true
  global_write: true
updated_at: '${now}'
---

# ${username}

Owner identity for this user-base instance.
`
  fs.writeFileSync(identity_path, identity_content)
  summary.files_created.push(`identity/${username}.md`)

  return { public_key_hex, private_key_hex }
}

function check_prerequisites() {
  const results = []

  // Runtime: Bun or Node.js 18+
  const is_bun = typeof process.versions.bun !== 'undefined'
  const runtime_version = is_bun ? process.versions.bun : process.versions.node
  const major = parseInt(runtime_version.split('.')[0], 10)
  const runtime_name = is_bun ? 'Bun' : 'Node.js 18+'
  const runtime_ok = is_bun ? true : major >= 18
  results.push({
    name: runtime_name,
    ok: runtime_ok,
    detail: `v${runtime_version}`
  })

  // git
  try {
    const git_version = execSync('git --version', { encoding: 'utf8', timeout: 5000 }).trim()
    results.push({ name: 'git', ok: true, detail: git_version })
  } catch {
    results.push({ name: 'git', ok: false, detail: 'not found' })
  }

  // ripgrep (used by search)
  try {
    const rg_version = execSync('rg --version', { encoding: 'utf8', timeout: 5000 })
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
    // AGENTS.md is a thin pointer to CLAUDE.md. When Anthropic and other
    // harnesses standardize on AGENTS.md, reverse the relationship: move
    // the full context into AGENTS.md and make CLAUDE.md the pointer.
    const content = `# AGENTS.md

See [CLAUDE.md](./CLAUDE.md) for the canonical project context file.
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
    .option('username', {
      type: 'string',
      description: 'Username for the owner identity',
      default: process.env.USER || 'owner'
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

  // Detect compiled binary mode: SYSTEM_BASE_DIRECTORY points to ~/.base
  // when running from compiled binary, or to the repo checkout in development.
  const is_compiled = process.env.SYSTEM_BASE_DIRECTORY?.includes('.base')
  const install_dir = is_compiled
    ? path.dirname(path.dirname(process.argv[0]))
    : null

  // Download system content on first run if compiled binary and not present.
  // Uses a .download-complete marker to detect partial downloads from prior
  // interrupted runs. Retries up to 3 times with exponential backoff.
  if (is_compiled && install_dir) {
    const system_dir = path.join(install_dir, 'system')
    const marker_path = path.join(system_dir, '.download-complete')
    const needs_download =
      !fs.existsSync(path.join(system_dir, 'schema')) ||
      !fs.existsSync(marker_path)

    if (needs_download) {
      if (!argv.json) {
        console.log('Downloading system content...')
      }

      const max_retries = 3
      let success = false

      for (let attempt = 1; attempt <= max_retries; attempt++) {
        try {
          const fetch_opts = { signal: AbortSignal.timeout(30000) }
          const manifest_url = ensure_raw_url(
            'https://base.tint.space/system/manifest.json'
          )
          const response = await fetch(manifest_url, fetch_opts)
          if (!response.ok) {
            throw new Error(`manifest fetch failed: ${response.status}`)
          }
          validate_raw_response(response, manifest_url)
          const manifest = await response.json()
          let all_files_ok = true

          // Download files with bounded concurrency
          const files = manifest.files || []
          const batch_size = 10
          for (let i = 0; i < files.length; i += batch_size) {
            const batch = files.slice(i, i + batch_size)
            const results = await Promise.all(
              batch.map(async (file) => {
                const file_path = typeof file === 'string' ? file : file.path
                const file_url = ensure_raw_url(
                  `https://base.tint.space/system/${file_path}`
                )
                const local_path = path.join(system_dir, file_path)
                fs.mkdirSync(path.dirname(local_path), { recursive: true })
                const file_response = await fetch(file_url, fetch_opts)
                if (file_response.ok) {
                  validate_raw_response(file_response, file_url)
                  fs.writeFileSync(local_path, await file_response.text())
                  return true
                }
                return false
              })
            )
            if (results.some((ok) => !ok)) {
              all_files_ok = false
            }
          }

          if (all_files_ok) {
            fs.writeFileSync(marker_path, new Date().toISOString())
            success = true
            if (!argv.json) {
              console.log('System content downloaded.')
            }
            break
          }

          throw new Error('some files failed to download')
        } catch (err) {
          if (attempt < max_retries) {
            const delay_ms = 1000 * Math.pow(2, attempt - 1)
            if (!argv.json) {
              console.log(
                `Download attempt ${attempt} failed, retrying in ${delay_ms / 1000}s...`
              )
            }
            await new Promise((resolve) => setTimeout(resolve, delay_ms))
          }
        }
      }

      if (!success && !argv.json) {
        console.log(
          'Could not download system content (base.tint.space unreachable).'
        )
        console.log('System content will be downloaded on next `base update`.')
      }
    }
  }

  for (const dir_info of DIRECTORIES) {
    ensure_directory(base_path, dir_info, summary)
  }

  ensure_gitignore(base_path, summary)
  ensure_config(base_path, summary)
  ensure_git_repo(base_path, summary)
  ensure_claude_md(base_path, summary)
  ensure_agents_md(base_path, summary)

  // Generate owner identity and set user_public_key in config
  const username = argv.username || process.env.USER || 'owner'
  const identity_result = ensure_owner_identity(base_path, username, summary)

  if (argv.json) {
    if (identity_result) {
      summary.identity = {
        username,
        public_key: identity_result.public_key_hex,
        private_key: identity_result.private_key_hex
      }
    }
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

    if (identity_result) {
      console.log('\n--- Identity Generated ---\n')
      console.log(`  Username:    ${username}`)
      console.log(`  Public Key:  ${identity_result.public_key_hex}`)
      console.log(`  Private Key: ${identity_result.private_key_hex}`)
      console.log('')
      console.log('  IMPORTANT: Save the private key securely. It cannot be recovered.')
      console.log('  The public key has been written to config/config.json.')
    }

    // Next steps
    console.log('\n--- Next Steps ---\n')
    console.log(`1. Set the environment variable (add to your shell profile):`)
    console.log(`   export USER_BASE_DIRECTORY="${base_path}"`)
    if (is_compiled && install_dir) {
      console.log(`   export SYSTEM_BASE_DIRECTORY="${install_dir}"`)
    }
    console.log('')
    console.log('2. Try your first command:')
    console.log('   base entity create "user:task/hello-world.md" --type task --title "Hello World" --description "My first task"')
    console.log('   base entity list -t task')
    console.log('')
    console.log('3. Connect an AI assistant:')
    console.log('   Claude Code: run `claude` in this directory (CLAUDE.md provides context)')
    console.log('')
    console.log('4. Explore:')
    console.log('   base --help              # See all commands')
    console.log('   base search "query"      # Search your knowledge base')
    console.log('   base entity list         # List all entities')
  }
}

// Allow direct execution (skip in compiled binaries where all modules
// share the same import.meta.url and this check would incorrectly match)
const current_file = fileURLToPath(import.meta.url)
if (!current_file.includes('/$bunfs/') && process.argv[1] === current_file) {
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
