/**
 * Pi Integration -- public exports for CLI and unified import pipeline.
 */

import debug from 'debug'

import { PiSessionProvider, PI_DEFAULT_SESSIONS_DIR } from './pi-session-provider.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

export { PiSessionProvider, PI_DEFAULT_SESSIONS_DIR }
export { link_pi_branches } from './pi-branch-linker.mjs'
export {
  get_unsupported_summary as get_pi_unsupported,
  clear_unsupported_tracking as clear_pi_unsupported
} from './normalize-pi-session.mjs'

const log = debug('integrations:pi')

export const list_pi_sessions = async (options = {}) => {
  const provider = new PiSessionProvider()
  const sessions = await provider.find_sessions({
    pi_sessions_dir: options.pi_sessions_dir,
    pi_sessions_dirs: options.pi_sessions_dirs,
    from_date: options.from_date,
    to_date: options.to_date
  })
  // Group branches by header.id for display ergonomics.
  const grouped = new Map()
  for (const s of sessions) {
    const id = s.header.id
    if (!grouped.has(id)) {
      grouped.set(id, {
        session_id: id,
        project_path: s.project_path,
        file_path: s.file_path,
        version: s.header.version,
        branch_count: 0,
        entry_count: 0
      })
    }
    const group = grouped.get(id)
    group.branch_count++
    group.entry_count += s.branch_entries.length
  }
  return Array.from(grouped.values())
}

export const import_pi_sessions = async (options = {}) => {
  log('Starting Pi session import')

  if (options.dry_run) {
    const provider = new PiSessionProvider()
    let valid = 0
    let invalid = 0
    let total = 0
    for await (const session of provider.stream_sessions({
      pi_sessions_dir: options.pi_sessions_dir,
      pi_sessions_dirs: options.pi_sessions_dirs,
      from_date: options.from_date,
      to_date: options.to_date
    })) {
      total++
      const v = provider.validate_session(session)
      if (v.valid) valid++
      else invalid++
    }
    return {
      dry_run: true,
      sessions_found: total,
      valid_sessions: valid,
      invalid_sessions: invalid
    }
  }

  const results = await create_threads_from_session_provider({
    provider_name: 'pi',
    user_base_directory: options.user_base_directory,
    verbose: options.verbose,
    allow_updates: options.allow_updates,
    merge_agents: false,
    include_warm_agents: false,
    provider_options: {
      pi_sessions_dir: options.pi_sessions_dir,
      pi_sessions_dirs: options.pi_sessions_dirs,
      from_date: options.from_date,
      to_date: options.to_date
    },
    bulk_import: options.bulk_import !== false
  })

  const sessions_processed =
    results.summary?.total ??
    results.created.length +
      results.updated.length +
      results.skipped.length +
      results.failed.length

  return {
    sessions_found: sessions_processed + (results.invalid_sessions_count || 0),
    valid_sessions: sessions_processed,
    invalid_sessions: results.invalid_sessions_count || 0,
    threads_created: results.created.length,
    threads_updated: results.updated.length,
    threads_failed: results.failed.length,
    threads_skipped: results.skipped.length,
    branches_found: sessions_processed,
    success_rate: results.summary?.success_rate,
    results
  }
}
