/**
 * Pi Session Helpers
 *
 * JSONL parsing, header validation, version migration, and file discovery
 * for Pi coding-agent sessions.
 *
 * Pi session file layout (per https://github.com/badlogic/pi-mono):
 * - Path: ~/.pi/agent/sessions/--<project-path-->/<timestamp>_<uuid>.jsonl
 * - First non-empty line: header object with type === 'session', id, version,
 *   optional parentSession (path of forked-from session file).
 * - Subsequent lines: entry objects with id/parentId, type/role, content,
 *   timestamps. The tree is encoded via parentId references.
 *
 * Versions:
 *   v1 - linear sessions, no id/parentId on entries
 *   v2 - tree sessions, role 'hookMessage' (renamed to 'custom' in v3)
 *   v3 - current; tree sessions with the documented schema
 *
 * Migration is purely structural -- content blocks are stable across versions.
 */

import fs from 'fs/promises'
import path from 'path'
import { homedir } from 'os'
import debug from 'debug'

const log = debug('integrations:pi:helpers')

export const PI_DEFAULT_SESSIONS_DIR = path.join(
  homedir(),
  '.pi',
  'agent',
  'sessions'
)

export const PI_SUPPORTED_VERSIONS = [1, 2, 3]

/**
 * Parse a Pi JSONL file into a header + entries pair.
 *
 * Returns { header, entries }. Throws if the header is missing or malformed.
 * Skips malformed entry lines after logging.
 */
export const parse_pi_jsonl = async ({ file_path }) => {
  const content = await fs.readFile(file_path, 'utf-8')
  const lines = content.split('\n')

  let header = null
  const entries = []
  let line_number = 0

  for (const raw_line of lines) {
    line_number++
    const line = raw_line.trim()
    if (!line) continue

    let parsed
    try {
      parsed = JSON.parse(line)
    } catch (parse_error) {
      log(
        `parse_pi_jsonl: malformed JSON at line ${line_number} of ${file_path}: ${parse_error.message}`
      )
      continue
    }

    if (!header && parsed && parsed.type === 'session') {
      header = parsed
      continue
    }

    if (parsed && typeof parsed === 'object') {
      entries.push(parsed)
    }
  }

  if (!header) {
    throw new Error(
      `parse_pi_jsonl: no session header found in ${file_path}`
    )
  }

  return { header, entries, file_path }
}

/**
 * Validate the parsed Pi header. Returns { valid, reason }.
 */
export const validate_pi_header = ({ header }) => {
  if (!header || typeof header !== 'object') {
    return { valid: false, reason: 'header missing or not an object' }
  }
  if (header.type !== 'session') {
    return { valid: false, reason: `header type is '${header.type}', expected 'session'` }
  }
  if (!header.id || typeof header.id !== 'string') {
    return { valid: false, reason: 'header missing string id' }
  }
  if (!PI_SUPPORTED_VERSIONS.includes(header.version)) {
    return {
      valid: false,
      reason: `header.version=${JSON.stringify(header.version)} is not supported; expected one of ${PI_SUPPORTED_VERSIONS.join(', ')}`
    }
  }
  return { valid: true }
}

/**
 * Migrate Pi entries to v3 shape:
 * - v1 entries lack id/parentId -- assign sequential ids and chain parentId
 * - v2 entries with role 'hookMessage' are renamed to role 'custom'
 * - v3 entries pass through
 *
 * IMPORTANT: every migrated entry whose original Pi shape is a chat message
 * (i.e., the v1/v2 entries that carried `role: 'user'`/`'assistant'` at the
 * outer level) MUST land with outer `type: 'message'` and `role` carrying the
 * user/assistant distinction. This protects against `is_warm_session` Patterns
 * 1 and 2 (claude-session-helpers.mjs:489-510), which match
 * `entry.type === 'assistant'` / `'user'` and would silently skip Pi sessions.
 */
export const migrate_pi_entries = ({ header, entries }) => {
  const version = header?.version ?? 3
  if (version === 3) {
    return entries.map(normalize_outer_message_shape)
  }
  if (version === 2) {
    return entries
      .map((entry) => {
        const next = { ...entry }
        if (next.role === 'hookMessage') next.role = 'custom'
        return next
      })
      .map(normalize_outer_message_shape)
  }
  if (version === 1) {
    let prev_id = null
    return entries.map((entry, index) => {
      const next = { ...entry }
      if (!next.id) next.id = `pi-v1-${header.id}-${index}`
      if (!next.parentId) next.parentId = prev_id
      prev_id = next.id
      return normalize_outer_message_shape(next)
    })
  }
  throw new Error(`migrate_pi_entries: unsupported version ${version}`)
}

const MESSAGE_ROLES = new Set([
  'user',
  'assistant',
  'toolResult',
  'bashExecution',
  'custom',
  'branchSummary',
  'compactionSummary'
])

const normalize_outer_message_shape = (entry) => {
  if (!entry || typeof entry !== 'object') return entry
  // Pi v3 already uses outer type='message' with inner role. Older bare-role
  // entries (or any that surface role at the outer type slot) must be coerced
  // back to outer type='message'.
  if (entry.type === 'user' || entry.type === 'assistant') {
    return { ...entry, role: entry.type, type: 'message' }
  }
  if (!entry.type && MESSAGE_ROLES.has(entry.role)) {
    return { ...entry, type: 'message' }
  }
  return entry
}

/**
 * Discover Pi session files under one or more sessions directories.
 *
 * Returns an array of { file_path, project_path, mtime } objects.
 * project_path is decoded from the Pi --<project-path-->-style directory name.
 */
export const find_pi_session_files = async ({
  sessions_dirs = [PI_DEFAULT_SESSIONS_DIR],
  from_date = null,
  to_date = null
} = {}) => {
  const results = []
  const from_ms = from_date ? new Date(from_date).getTime() : null
  const to_ms = to_date ? new Date(to_date).getTime() : null

  for (const sessions_dir of sessions_dirs) {
    let project_dirs
    try {
      project_dirs = await fs.readdir(sessions_dir)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }

    for (const project_dirname of project_dirs) {
      const project_dir = path.join(sessions_dir, project_dirname)
      let stat
      try {
        stat = await fs.stat(project_dir)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue

      const project_path = decode_pi_project_dirname(project_dirname)

      let files
      try {
        files = await fs.readdir(project_dir)
      } catch {
        continue
      }
      for (const filename of files) {
        if (!filename.endsWith('.jsonl')) continue
        const file_path = path.join(project_dir, filename)
        let file_stat
        try {
          file_stat = await fs.stat(file_path)
        } catch {
          continue
        }
        const mtime_ms = file_stat.mtimeMs
        if (from_ms != null && mtime_ms < from_ms) continue
        if (to_ms != null && mtime_ms > to_ms) continue
        results.push({ file_path, project_path, mtime: file_stat.mtime })
      }
    }
  }

  results.sort((a, b) => a.mtime - b.mtime)
  return results
}

const decode_pi_project_dirname = (dirname) => {
  // Pi encodes project paths by replacing '/' with '--'. Wrapping '--' tokens
  // are stripped so '--Users--user--code--' decodes to '/Users/user/code'.
  let decoded = dirname.replace(/--/g, '/')
  if (!decoded.startsWith('/')) decoded = '/' + decoded
  decoded = decoded.replace(/\/+$/, '')
  return decoded
}
