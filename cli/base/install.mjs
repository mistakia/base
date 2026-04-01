/**
 * Install subcommand
 *
 * Install extensions, workflows, guidelines, skills, hooks from URLs.
 *
 * Usage:
 *   base install https://base.tint.space/extension/graph
 *   base install https://base.tint.space/workflow/create-github-issue.md
 *   base install https://base.tint.space/guideline/shell-pitfalls.md
 *   base install <url> --dry-run     # Preview without changes
 *   base install <url> --yes         # Non-interactive mode
 */

import fs from 'fs'
import path from 'path'
import config from '#config'
import { ensure_raw_url, validate_raw_response } from '#libs-server/utils/raw-fetch.mjs'

export const command = 'install <url>'
export const describe = 'Install content from a URL (extension, workflow, guideline, skill, hook)'

export const builder = (yargs) =>
  yargs
    .positional('url', {
      describe: 'URL to install from (base.tint.space or any URL)',
      type: 'string'
    })
    .option('dry-run', {
      describe: 'Preview changes without modifying files',
      type: 'boolean',
      default: false
    })
    .option('yes', {
      alias: 'y',
      describe: 'Non-interactive mode (skip confirmation)',
      type: 'boolean',
      default: false
    })
    .example(
      '$0 install https://base.tint.space/extension/graph',
      'Install an extension'
    )
    .example(
      '$0 install https://base.tint.space/workflow/create-github-issue.md',
      'Install a workflow'
    )

// Content type detection from URL path segments
const CONTENT_TYPES = {
  extension: { dir: 'extension', is_directory: true },
  workflow: { dir: 'workflow', is_directory: false },
  guideline: { dir: 'guideline', is_directory: false },
  skill: { dir: 'skill', is_directory: true },
  hook: { dir: 'hook', is_directory: false },
  cli: { dir: 'cli', is_directory: false }
}

function detect_content_type(url) {
  const url_obj = new URL(url)
  const segments = url_obj.pathname.split('/').filter(Boolean)

  for (const segment of segments) {
    if (CONTENT_TYPES[segment]) {
      const name = segments[segments.indexOf(segment) + 1]
      return { type: segment, name, ...CONTENT_TYPES[segment] }
    }
  }

  // Fallback: guess from file extension
  const last_segment = segments[segments.length - 1]
  if (last_segment?.endsWith('.md')) {
    // Could be workflow, guideline, or text
    return { type: 'workflow', name: last_segment, dir: 'workflow', is_directory: false }
  }
  if (last_segment?.endsWith('.sh')) {
    return { type: 'hook', name: last_segment, dir: 'hook', is_directory: false }
  }
  if (last_segment?.endsWith('.mjs') || last_segment?.endsWith('.js')) {
    return { type: 'cli', name: last_segment, dir: 'cli', is_directory: false }
  }

  return null
}

async function fetch_single_file(url) {
  const raw_url = ensure_raw_url(url)
  const response = await fetch(raw_url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${raw_url}: HTTP ${response.status}`)
  }
  validate_raw_response(response, raw_url)
  return await response.text()
}

async function fetch_manifest(url) {
  // Try manifest.json first
  const manifest_url = url.endsWith('/')
    ? `${url}manifest.json`
    : `${url}/manifest.json`

  try {
    const response = await fetch(manifest_url)
    if (response.ok) {
      validate_raw_response(response, manifest_url)
      return await response.json()
    }
  } catch {
    // No manifest available
  }

  return null
}

function get_file_status(local_path, remote_content) {
  if (!fs.existsSync(local_path)) {
    return 'CREATE'
  }

  const local_content = fs.readFileSync(local_path, 'utf8')
  if (local_content === remote_content) {
    return 'UNCHANGED'
  }

  return 'MODIFIED'
}

function count_line_changes(local_path, remote_content) {
  if (!fs.existsSync(local_path)) {
    return remote_content.split('\n').length
  }

  const local_lines = fs.readFileSync(local_path, 'utf8').split('\n')
  const remote_lines = remote_content.split('\n')

  let changed = 0
  const max_len = Math.max(local_lines.length, remote_lines.length)
  for (let i = 0; i < max_len; i++) {
    if (local_lines[i] !== remote_lines[i]) changed++
  }
  return changed
}

export const handler = async (argv) => {
  const { url } = argv
  const user_base = config.user_base_directory

  if (!user_base) {
    console.error('No user-base directory configured. Run `base init` first.')
    process.exit(1)
  }

  // Detect content type from URL
  const content_info = detect_content_type(url)
  if (!content_info) {
    console.error(`Cannot determine content type from URL: ${url}`)
    console.error('URL should contain a path segment like /extension/, /workflow/, /guideline/, etc.')
    process.exit(1)
  }

  console.log(`Installing ${content_info.type}: ${content_info.name}`)

  const target_dir = path.join(user_base, content_info.dir)
  fs.mkdirSync(target_dir, { recursive: true })

  if (content_info.is_directory) {
    // Directory content (extensions, skills) -- needs manifest
    const manifest = await fetch_manifest(url)
    if (!manifest) {
      console.error(`No manifest found at ${url}`)
      console.error('Directory content requires a manifest.json file.')
      process.exit(1)
    }

    const base_url = url.endsWith('/') ? url : `${url}/`
    const content_dir = path.join(target_dir, content_info.name)
    const files_to_install = []

    for (const file of manifest.files || []) {
      const file_url = `${base_url}${file.path || file}`
      const file_path = typeof file === 'string' ? file : file.path
      const local_path = path.join(content_dir, file_path)

      const content = await fetch_single_file(file_url)
      const status = get_file_status(local_path, content)
      const lines = status !== 'UNCHANGED' ? count_line_changes(local_path, content) : 0

      files_to_install.push({ file_path, local_path, content, status, lines })
    }

    // Display summary
    console.log()
    for (const f of files_to_install) {
      const line_info = f.lines > 0 ? ` (+${f.lines} lines)` : ''
      console.log(`  ${f.status.padEnd(10)} ${f.file_path}${line_info}`)
    }

    const changes = files_to_install.filter((f) => f.status !== 'UNCHANGED')
    if (changes.length === 0) {
      console.log('\nAlready up to date.')
      return
    }

    if (argv.dryRun) {
      console.log(`\nDry run: ${changes.length} files would be modified`)
      return
    }

    // Confirm unless --yes
    if (!argv.yes && process.stdin.isTTY) {
      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      const answer = await new Promise((resolve) => {
        rl.question(`\nInstall ${changes.length} files? [y/N] `, resolve)
      })
      rl.close()
      if (answer.toLowerCase() !== 'y') {
        console.log('Cancelled.')
        return
      }
    }

    // Write files
    for (const f of changes) {
      fs.mkdirSync(path.dirname(f.local_path), { recursive: true })
      fs.writeFileSync(f.local_path, f.content)
    }

    console.log(`\nInstalled ${changes.length} files to ${content_dir}`)
  } else {
    // Single file content (workflows, guidelines, hooks)
    const content = await fetch_single_file(url)
    const filename = content_info.name || path.basename(new URL(url).pathname)
    const local_path = path.join(target_dir, filename)

    const status = get_file_status(local_path, content)
    const lines = status !== 'UNCHANGED' ? count_line_changes(local_path, content) : 0

    const line_info = lines > 0 ? ` (+${lines} lines)` : ''
    console.log(`\n  ${status.padEnd(10)} ${filename}${line_info}`)

    if (status === 'UNCHANGED') {
      console.log('\nAlready up to date.')
      return
    }

    if (argv.dryRun) {
      console.log('\nDry run: file would be modified')
      return
    }

    if (!argv.yes && status === 'MODIFIED' && process.stdin.isTTY) {
      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      const answer = await new Promise((resolve) => {
        rl.question('\nOverwrite existing file? [y/N] ', resolve)
      })
      rl.close()
      if (answer.toLowerCase() !== 'y') {
        console.log('Cancelled.')
        return
      }
    }

    fs.writeFileSync(local_path, content)
    console.log(`\nInstalled to ${local_path}`)
  }
}
