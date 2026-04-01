/**
 * Uninstall subcommand
 *
 * Remove the Base CLI installation: binary, system content, PATH entries.
 * Optionally remove the user-base data directory.
 *
 * Usage:
 *   base uninstall              # Interactive removal
 *   base uninstall --yes        # Non-interactive removal
 *   base uninstall --dry-run    # Preview what would be removed
 *   base uninstall --include-data --yes  # Also remove user-base directory
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'

export const command = 'uninstall'
export const describe = 'Remove Base CLI installation'

export const builder = (yargs) =>
  yargs
    .option('yes', {
      alias: 'y',
      describe: 'Skip confirmation prompts',
      type: 'boolean',
      default: false
    })
    .option('include-data', {
      describe: 'Also remove user-base data directory (requires double confirmation)',
      type: 'boolean',
      default: false
    })
    .option('dry-run', {
      describe: 'Preview what would be removed without making changes',
      type: 'boolean',
      default: false
    })

function get_install_dir() {
  return process.env.BASE_INSTALL_DIR || path.join(process.env.HOME, '.base')
}

function find_shell_profiles() {
  const home = process.env.HOME
  const candidates = [
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
    path.join(home, '.zshrc'),
    path.join(home, '.zprofile'),
    path.join(home, '.config', 'fish', 'config.fish')
  ]
  return candidates.filter((p) => fs.existsSync(p))
}

function remove_path_entries(profile_path, install_dir, dry_run) {
  const content = fs.readFileSync(profile_path, 'utf8')
  const bin_dir = path.join(install_dir, 'bin')
  const lines = content.split('\n')
  const filtered = []
  let removed = 0
  let skip_next = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip "# Base CLI" marker and the following export line
    if (line.trim() === '# Base CLI') {
      skip_next = true
      removed++
      continue
    }

    if (skip_next && line.includes(bin_dir)) {
      skip_next = false
      removed++
      continue
    }
    skip_next = false

    // Also catch standalone PATH exports referencing our bin dir
    if (line.includes(bin_dir) && line.includes('export PATH')) {
      removed++
      continue
    }

    filtered.push(line)
  }

  if (removed > 0) {
    // Remove trailing blank lines left by removal
    while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
      filtered.pop()
    }
    filtered.push('') // ensure trailing newline

    if (!dry_run) {
      fs.writeFileSync(profile_path, filtered.join('\n'))
    }
    return removed
  }

  return 0
}

async function confirm(prompt_text) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(`${prompt_text} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

export const handler = async (argv) => {
  const install_dir = get_install_dir()
  const user_base_dir = process.env.USER_BASE_DIRECTORY
  const prefix = argv.dryRun ? '[dry-run] ' : ''

  console.log(`${prefix}Base CLI uninstall`)
  console.log('')

  // Collect what will be removed
  const actions = []

  if (fs.existsSync(install_dir)) {
    actions.push(`Remove install directory: ${install_dir}`)
  }

  const profiles = find_shell_profiles()
  const bin_dir = path.join(install_dir, 'bin')
  for (const profile of profiles) {
    const content = fs.readFileSync(profile, 'utf8')
    if (content.includes(bin_dir)) {
      actions.push(`Remove PATH entry from: ${profile}`)
    }
  }

  if (argv.includeData && user_base_dir && fs.existsSync(user_base_dir)) {
    actions.push(`Remove user-base directory: ${user_base_dir}`)
  }

  if (actions.length === 0) {
    console.log('Nothing to remove. Base CLI does not appear to be installed.')
    return
  }

  console.log('The following actions will be performed:')
  for (const action of actions) {
    console.log(`  - ${action}`)
  }
  console.log('')

  if (argv.dryRun) {
    console.log('Dry run complete. No changes made.')
    return
  }

  // Confirm
  if (!argv.yes) {
    const confirmed = await confirm('Proceed with uninstall?')
    if (!confirmed) {
      console.log('Uninstall cancelled.')
      return
    }
  }

  // Double confirmation for data removal
  if (argv.includeData && user_base_dir && fs.existsSync(user_base_dir)) {
    if (!argv.yes) {
      console.log('')
      console.log(
        `WARNING: This will permanently delete your user-base directory:`
      )
      console.log(`  ${user_base_dir}`)
      console.log('')
      const confirmed = await confirm(
        'Are you sure you want to delete all your data?'
      )
      if (!confirmed) {
        console.log('Data removal cancelled. Continuing with CLI uninstall only.')
        argv.includeData = false
      }
    }
  }

  // Remove PATH entries from shell profiles
  for (const profile of profiles) {
    const removed = remove_path_entries(profile, install_dir, false)
    if (removed > 0) {
      console.log(`Removed PATH entry from ${profile}`)
    }
  }

  // Remove install directory
  if (fs.existsSync(install_dir)) {
    fs.rmSync(install_dir, { recursive: true, force: true })
    console.log(`Removed ${install_dir}`)
  }

  // Remove user-base directory if requested
  if (argv.includeData && user_base_dir && fs.existsSync(user_base_dir)) {
    fs.rmSync(user_base_dir, { recursive: true, force: true })
    console.log(`Removed ${user_base_dir}`)
  }

  console.log('')
  console.log('Base CLI has been uninstalled.')
  if (!argv.includeData && user_base_dir) {
    console.log(`Your data directory was preserved: ${user_base_dir}`)
  }
}
