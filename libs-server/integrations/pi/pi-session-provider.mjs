/**
 * Pi Session Provider
 *
 * SessionProviderBase implementation for Pi coding-agent sessions.
 *
 * Pi sessions are tree-structured: a single .jsonl file may contain multiple
 * branches. This provider yields one raw session per branch, so the unified
 * thread-creation layer creates one thread per branch without structural
 * changes. Cross-branch linking happens post-import in pi-branch-linker.mjs.
 */

import debug from 'debug'
import path from 'path'

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'
import {
  parse_pi_jsonl,
  validate_pi_header,
  migrate_pi_entries,
  find_pi_session_files,
  PI_DEFAULT_SESSIONS_DIR
} from './pi-session-helpers.mjs'
import {
  extract_all_pi_branches,
  identify_pi_branch_points
} from './pi-tree.mjs'
import {
  normalize_pi_session,
  compose_pi_branch_session_id
} from './normalize-pi-session.mjs'

const log = debug('integrations:pi')

export { PI_DEFAULT_SESSIONS_DIR }

export class PiSessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'pi' })
  }

  /**
   * Pi has no raw-data persister yet. Override the default-true getter so the
   * dispatcher passes null raw_session_data and skips save_raw_session_data.
   */
  get supports_raw_data() {
    return false
  }

  /**
   * Discover Pi session files and return one raw session per branch.
   */
  async find_sessions({
    session_file,
    pi_sessions_dir,
    pi_sessions_dirs,
    from_date,
    to_date,
    single_leaf_only = false
  } = {}) {
    if (session_file) {
      try {
        return await load_branches_from_file({
          file_path: session_file,
          project_path: project_path_from_file(session_file),
          single_leaf_only
        })
      } catch (error) {
        log(`Failed to load Pi session ${session_file}: ${error.message}`)
        return []
      }
    }
    const sessions_dirs = resolve_sessions_dirs({
      pi_sessions_dir,
      pi_sessions_dirs
    })
    const files = await find_pi_session_files({
      sessions_dirs,
      from_date,
      to_date
    })

    const raw_sessions = []
    for (const { file_path, project_path } of files) {
      try {
        const branches = await load_branches_from_file({
          file_path,
          project_path,
          single_leaf_only
        })
        raw_sessions.push(...branches)
      } catch (error) {
        log(`Failed to load Pi session ${file_path}: ${error.message}`)
      }
    }
    return raw_sessions
  }

  async *stream_sessions({
    session_file,
    pi_sessions_dir,
    pi_sessions_dirs,
    from_date,
    to_date,
    single_leaf_only = false
  } = {}) {
    if (session_file) {
      try {
        const branches = await load_branches_from_file({
          file_path: session_file,
          project_path: project_path_from_file(session_file),
          single_leaf_only
        })
        for (const branch of branches) yield branch
      } catch (error) {
        log(`Failed to load Pi session ${session_file}: ${error.message}`)
      }
      return
    }
    const sessions_dirs = resolve_sessions_dirs({
      pi_sessions_dir,
      pi_sessions_dirs
    })
    const files = await find_pi_session_files({
      sessions_dirs,
      from_date,
      to_date
    })
    for (const { file_path, project_path } of files) {
      try {
        const branches = await load_branches_from_file({
          file_path,
          project_path,
          single_leaf_only
        })
        for (const branch of branches) yield branch
      } catch (error) {
        log(`Failed to load Pi session ${file_path}: ${error.message}`)
      }
    }
  }

  normalize_session(raw_session) {
    return normalize_pi_session(raw_session)
  }

  validate_session(raw_session) {
    if (!raw_session) {
      return { valid: false, errors: ['no session data'] }
    }
    const header_check = validate_pi_header({ header: raw_session.header })
    if (!header_check.valid) {
      return { valid: false, errors: [header_check.reason] }
    }
    if (!Array.isArray(raw_session.branch_entries) || raw_session.branch_entries.length === 0) {
      return {
        valid: false,
        errors: ['branch_entries empty or missing']
      }
    }
    const has_message = raw_session.branch_entries.some(
      (entry) => entry.type === 'message'
    )
    if (!has_message) {
      return { valid: false, errors: ['no message entries in branch'] }
    }
    return { valid: true, errors: [] }
  }

  get_inference_provider() {
    // Pi multi-provider; primary is recorded on each session's metadata.
    // Default identifier: 'pi' until per-session override resolves it.
    return 'pi'
  }

  get_models_from_session(raw_session) {
    const models = new Set()
    for (const entry of raw_session.branch_entries || []) {
      if (entry.type === 'message' && entry.role === 'assistant') {
        const model = entry.model ?? entry.message?.model
        if (model) models.add(model)
      }
      if (entry.type === 'model_change') {
        const m = entry.newModel ?? entry.model
        if (m) models.add(m)
      }
    }
    return Array.from(models)
  }

  get_session_id(raw_session) {
    return raw_session.session_id
  }
}

const resolve_sessions_dirs = ({ pi_sessions_dir, pi_sessions_dirs }) => {
  if (Array.isArray(pi_sessions_dirs) && pi_sessions_dirs.length > 0) {
    return pi_sessions_dirs
  }
  if (typeof pi_sessions_dirs === 'string' && pi_sessions_dirs.length > 0) {
    return pi_sessions_dirs.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (pi_sessions_dir) return [pi_sessions_dir]
  return [PI_DEFAULT_SESSIONS_DIR]
}

const project_path_from_file = (file_path) => {
  const parent = path.basename(path.dirname(file_path))
  let decoded = parent.replace(/--/g, '/')
  if (!decoded.startsWith('/')) decoded = '/' + decoded
  return decoded.replace(/\/+$/, '')
}

const load_branches_from_file = async ({
  file_path,
  project_path,
  single_leaf_only = false
}) => {
  const { header, entries } = await parse_pi_jsonl({ file_path })
  const header_check = validate_pi_header({ header })
  if (!header_check.valid) {
    throw new Error(`invalid Pi header: ${header_check.reason}`)
  }
  const migrated = migrate_pi_entries({ header, entries })
  const all_branches = extract_all_pi_branches({ entries: migrated })
  const branch_points = identify_pi_branch_points({ entries: migrated })

  const all_branch_session_ids = all_branches.map((b) =>
    compose_pi_branch_session_id({
      header_id: header.id,
      branch_index: b.branch_index
    })
  )

  const branches = single_leaf_only
    ? all_branches.filter((b) => b.branch_index === 0)
    : all_branches

  return branches.map((b) => {
    const session_id = compose_pi_branch_session_id({
      header_id: header.id,
      branch_index: b.branch_index
    })
    return {
      header,
      branch_entries: b.entries,
      // is_warm_session reads .entries unconditionally; alias to branch_entries.
      entries: b.entries,
      branch_index: b.branch_index,
      total_branches: branches.length,
      branch_points,
      all_branch_session_ids,
      parent_session_path: header.parentSession ?? null,
      project_path,
      file_path,
      session_id
    }
  })
}

