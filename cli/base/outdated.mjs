/**
 * Outdated subcommand
 *
 * Check for available updates across all Base CLI components:
 * binary version, system content, installed extensions.
 *
 * Usage:
 *   base outdated          # Display update status table
 *   base outdated --json   # Machine-readable output
 *   base outdated --check  # Exit code 1 if updates available
 */

import fs from 'fs'
import path from 'path'
import { ensure_raw_url, validate_raw_response } from '#libs-server/utils/raw-fetch.mjs'

export const command = 'outdated'
export const describe = 'Check for available updates'

export const builder = (yargs) =>
  yargs
    .option('json', {
      describe: 'Output results as JSON',
      type: 'boolean',
      default: false
    })
    .option('check', {
      describe: 'Exit with code 1 if updates are available (for scripting)',
      type: 'boolean',
      default: false
    })

const BASE_URL = 'https://base.tint.space'

function get_install_dir() {
  return process.env.BASE_INSTALL_DIR || path.join(process.env.HOME, '.base')
}

function read_local_version() {
  const version_path = path.join(get_install_dir(), 'version.json')
  try {
    return JSON.parse(fs.readFileSync(version_path, 'utf8'))
  } catch {
    return null
  }
}

const FETCH_OPTS = { signal: AbortSignal.timeout(15000) }

async function fetch_latest_version() {
  try {
    const url = ensure_raw_url(`${BASE_URL}/releases/latest/version.json`)
    const response = await fetch(url, FETCH_OPTS)
    if (response.ok) {
      validate_raw_response(response, url)
      return await response.json()
    }
  } catch {
    // fall through
  }
  return null
}

async function check_system_content_freshness(install_dir) {
  const marker_path = path.join(install_dir, 'system', '.download-complete')
  let local_timestamp = null

  if (fs.existsSync(marker_path)) {
    try {
      local_timestamp = fs.readFileSync(marker_path, 'utf8').trim()
    } catch {
      // ignore
    }
  }

  try {
    const url = ensure_raw_url(`${BASE_URL}/system/manifest.json`)
    const response = await fetch(url, FETCH_OPTS)
    if (response.ok) {
      validate_raw_response(response, url)
      const manifest = await response.json()
      return {
        local_timestamp,
        remote_file_count: (manifest.files || []).length,
        has_local_content: fs.existsSync(
          path.join(install_dir, 'system', 'schema')
        )
      }
    }
  } catch {
    // fall through
  }

  return { local_timestamp, remote_file_count: null, has_local_content: false }
}

function format_table(components) {
  const headers = ['Component', 'Local', 'Latest', 'Status']
  const rows = components.map((c) => [
    c.name,
    c.local_version || 'not installed',
    c.latest_version || 'unknown',
    c.status
  ])

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  )

  const separator = widths.map((w) => '-'.repeat(w)).join('  ')
  const header_line = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join('  ')
  const body = rows
    .map((r) => r.map((cell, i) => cell.padEnd(widths[i])).join('  '))
    .join('\n')

  return `${header_line}\n${separator}\n${body}`
}

export const handler = async (argv) => {
  const install_dir = get_install_dir()
  const local_version = read_local_version()
  const components = []
  let has_updates = false

  // Fetch binary version and system content status in parallel
  const [latest_version, content_status] = await Promise.all([
    fetch_latest_version(),
    check_system_content_freshness(install_dir)
  ])

  const binary_up_to_date =
    local_version &&
    latest_version &&
    local_version.version === latest_version.version

  if (!binary_up_to_date && latest_version) {
    has_updates = true
  }

  components.push({
    name: 'Binary',
    local_version: local_version?.version || null,
    latest_version: latest_version?.version || null,
    status: !latest_version
      ? 'check failed'
      : binary_up_to_date
        ? 'up to date'
        : 'update available'
  })

  const content_up_to_date =
    content_status.has_local_content && content_status.local_timestamp

  if (!content_up_to_date && content_status.remote_file_count) {
    has_updates = true
  }

  components.push({
    name: 'System Content',
    local_version: content_status.has_local_content
      ? content_status.local_timestamp || 'present'
      : null,
    latest_version: content_status.remote_file_count
      ? `${content_status.remote_file_count} files`
      : null,
    status: !content_status.remote_file_count
      ? 'check failed'
      : content_up_to_date
        ? 'up to date'
        : content_status.has_local_content
          ? 'may need update'
          : 'not installed'
  })

  if (argv.json) {
    console.log(
      JSON.stringify({ components, has_updates }, null, 2)
    )
  } else {
    console.log(format_table(components))
    console.log('')
    if (has_updates) {
      console.log('Updates available. Run `base update` to install.')
    } else {
      console.log('Everything is up to date.')
    }
  }

  if (argv.check && has_updates) {
    process.exit(1)
  }
}
