/**
 * Setup subcommand
 *
 * Idempotent environment setup for the Base system.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'setup <command>'
export const describe = 'Setup and initialization operations'

export const builder = (yargs) =>
  yargs
    .command(
      'env',
      'Check and configure USER_BASE_DIRECTORY in shell profile and Claude Code settings',
      (yargs) =>
        yargs
          .option('user-base-dir', {
            describe: 'Path to user-base directory',
            type: 'string',
            default: join(homedir(), 'user-base')
          })
          .option('dry-run', {
            describe: 'Show what would be changed without modifying files',
            type: 'boolean',
            default: false
          }),
      handle_env
    )
    .demandCommand(1, 'Specify a subcommand: env')

export const handler = () => {}

/**
 * Detect which shell profile files exist and which to target for exports.
 *
 * @returns {{ shell: string, profile_path: string, profile_exists: boolean }}
 */
function detect_shell_profile() {
  const home = homedir()
  const shell = process.env.SHELL || '/bin/bash'

  // Check for bash-specific dotfile sourcing pattern (.bash_exports)
  const bash_exports = join(home, '.bash_exports')
  if (existsSync(bash_exports)) {
    return { shell, profile_path: bash_exports, profile_exists: true }
  }

  // Standard profile hierarchy
  const candidates = shell.includes('zsh')
    ? ['.zshenv', '.zprofile', '.zshrc']
    : ['.bash_profile', '.bashrc', '.profile']

  for (const candidate of candidates) {
    const path = join(home, candidate)
    if (existsSync(path)) {
      return { shell, profile_path: path, profile_exists: true }
    }
  }

  // Default to .bash_profile or .zshenv
  const default_file = shell.includes('zsh') ? '.zshenv' : '.bash_profile'
  return {
    shell,
    profile_path: join(home, default_file),
    profile_exists: false
  }
}

/**
 * Check if a file contains an export line for a given variable.
 *
 * @param {string} file_path
 * @param {string} var_name - Environment variable name to look for
 * @returns {{ found: boolean, value: string|null }}
 */
function check_file_for_export(file_path, var_name = 'USER_BASE_DIRECTORY') {
  if (!existsSync(file_path)) {
    return { found: false, value: null }
  }
  const content = readFileSync(file_path, 'utf8')
  const pattern = new RegExp(
    `^export\\s+${var_name}=["']?([^"'\\n]+)["']?`,
    'm'
  )
  const match = content.match(pattern)
  if (match) {
    // Resolve $HOME and $USER_BASE_DIRECTORY references in the value
    let value = match[1].replace(/\$HOME/g, homedir())
    value = value.replace(/\$USER_BASE_DIRECTORY/g, process.env.USER_BASE_DIRECTORY || '')
    return { found: true, value }
  }
  return { found: false, value: null }
}

/**
 * Check Claude Code project settings for USER_BASE_DIRECTORY in env.
 *
 * @param {string} user_base_dir
 * @returns {{ found: boolean, value: string|null, settings_path: string|null }}
 */
function check_claude_code_settings(user_base_dir) {
  const settings_path = join(user_base_dir, '.claude', 'settings.local.json')
  if (!existsSync(settings_path)) {
    return { found: false, value: null, settings_path }
  }
  try {
    const settings = JSON.parse(readFileSync(settings_path, 'utf8'))
    const value = settings?.env?.USER_BASE_DIRECTORY || null
    return { found: !!value, value, settings_path }
  } catch {
    return { found: false, value: null, settings_path }
  }
}

/**
 * Append an export line to a shell profile file.
 *
 * @param {string} profile_path
 * @param {string} var_name - Variable name
 * @param {string} value - Value (can use shell variable references like $USER_BASE_DIRECTORY)
 * @param {string} [comment] - Comment line above the export
 */
function append_export_to_profile(profile_path, var_name, value, comment) {
  let export_block = '\n'
  if (comment) {
    export_block += `# ${comment}\n`
  }
  export_block += `export ${var_name}="${value}"\n`
  const content = existsSync(profile_path)
    ? readFileSync(profile_path, 'utf8')
    : ''
  writeFileSync(profile_path, content + export_block, 'utf8')
}

/**
 * Add USER_BASE_DIRECTORY to Claude Code project settings env.
 *
 * @param {string} settings_path
 * @param {string} user_base_dir
 */
function update_claude_code_settings(settings_path, user_base_dir) {
  let settings = {}
  if (existsSync(settings_path)) {
    settings = JSON.parse(readFileSync(settings_path, 'utf8'))
  }
  if (!settings.env) {
    settings.env = {}
  }
  settings.env.USER_BASE_DIRECTORY = user_base_dir
  writeFileSync(settings_path, JSON.stringify(settings, null, 2) + '\n', 'utf8')
}

/**
 * Required environment variables for the Base system.
 * Each entry defines the variable, its default value derivation, and the
 * shell export value (which may reference other variables for DRY profiles).
 */
const REQUIRED_ENV_VARS = [
  {
    name: 'USER_BASE_DIRECTORY',
    shell_value: (dir) => dir,
    comment: 'User Base directory (used by Base system hooks, scripts, and services)',
    claude_code: true
  },
  {
    name: 'CONTAINER_USER_BASE_PATH',
    shell_value: () => '$USER_BASE_DIRECTORY',
    resolve_value: (dir) => dir,
    comment: 'Container mount path (defaults to USER_BASE_DIRECTORY on host)',
    claude_code: false
  }
]

async function handle_env(argv) {
  let exit_code = 0
  const user_base_dir = argv.userBaseDir
  const dry_run = argv.dryRun

  try {
    const actions = []
    const results = { checks: [], actions: [] }

    const { profile_path } = detect_shell_profile()

    // Check each required env var
    for (const env_var of REQUIRED_ENV_VARS) {
      const expected_value = env_var.resolve_value
        ? env_var.resolve_value(user_base_dir)
        : env_var.shell_value(user_base_dir)

      // Current environment
      const current = process.env[env_var.name]
      if (current) {
        console.log(`[ok] ${env_var.name} in environment: ${current}`)
      } else {
        console.log(`[--] ${env_var.name} not set in environment`)
      }

      // Shell profile
      const profile_check = check_file_for_export(profile_path, env_var.name)
      if (profile_check.found) {
        console.log(`[ok] ${env_var.name} in shell profile: ${profile_path}`)
      } else {
        console.log(`[--] ${env_var.name} missing from shell profile`)
        actions.push({
          type: 'shell_profile',
          var_name: env_var.name,
          path: profile_path,
          value: env_var.shell_value(user_base_dir),
          comment: env_var.comment
        })
      }

      // Claude Code settings (only for vars that need it)
      if (env_var.claude_code) {
        const claude_check = check_claude_code_settings(user_base_dir)
        if (claude_check.found) {
          console.log(`[ok] ${env_var.name} in Claude Code settings`)
        } else {
          console.log(`[--] ${env_var.name} missing from Claude Code settings`)
          if (claude_check.settings_path) {
            actions.push({
              type: 'claude_code',
              var_name: env_var.name,
              path: claude_check.settings_path,
              value: expected_value
            })
          }
        }
      }

      results.checks.push({
        name: env_var.name,
        env: current || null,
        profile: profile_check.found,
        claude_code: env_var.claude_code
          ? check_claude_code_settings(user_base_dir).found
          : null
      })
    }

    // Apply changes
    if (actions.length === 0) {
      console.log('\nAll checks passed. No changes needed.')
    } else {
      console.log(`\n${dry_run ? 'Would apply' : 'Applying'} ${actions.length} change(s):`)

      for (const action of actions) {
        const label =
          action.type === 'shell_profile'
            ? `export ${action.var_name} in ${action.path}`
            : `set env.${action.var_name} in ${action.path}`
        console.log(`  ${label}`)

        if (!dry_run) {
          if (action.type === 'shell_profile') {
            append_export_to_profile(
              action.path,
              action.var_name,
              action.value,
              action.comment
            )
          } else if (action.type === 'claude_code') {
            update_claude_code_settings(action.path, action.value)
          }
        }
      }

      if (dry_run) {
        console.log('\nDry run - no files modified.')
      } else {
        console.log(
          '\nDone. Restart your shell or run: source ' + profile_path
        )
      }
    }

    results.actions = actions.map((a) => ({
      type: a.type,
      var: a.var_name,
      path: a.path
    }))

    if (argv.json) {
      console.log(JSON.stringify(results, null, 2))
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }

  flush_and_exit(exit_code)
}
