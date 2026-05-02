/**
 * Pi Branch Linker
 *
 * Cross-thread post-processing for Pi imports. Runs after
 * create_threads_from_session_provider returns, consumes the created/updated
 * thread results, and:
 *
 *   - Groups threads by original_session_id (the Pi header.id) so sibling
 *     branches from the same .jsonl can be linked.
 *   - Adds `branched_from` relations from non-primary branches to the primary
 *     branch (branch_index 0).
 *   - Backfills `metadata.branch_thread_id` on existing `branch_point`
 *     timeline entries by rewriting timeline.jsonl in place.
 *
 * Forked-session linkage (Pi header.parentSession) is intentionally deferred:
 * resolving the parent thread requires reading the parent .jsonl from disk to
 * map its filename to header.id. Surface the skipped count rather than
 * pretending to have linked them.
 *
 * Skips threads whose metadata or timeline did not change.
 */

import path from 'path'
import debug from 'debug'

import { write_thread_metadata } from '#libs-server/threads/write-thread-metadata.mjs'
import { read_json_file_or_default } from '#libs-server/threads/thread-utils.mjs'
import {
  read_timeline_jsonl,
  write_timeline_jsonl
} from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import { entry_validators } from '#libs-server/threads/add-timeline-entry.mjs'
import { is_valid_provenance } from '#libs-shared/timeline/entry-provenance.mjs'
import { parse_relation_string } from '#libs-shared/relation-parser.mjs'
import {
  RELATION_BRANCHED_FROM
} from '#libs-shared/entity-relations.mjs'

const log = debug('integrations:pi:linker')

/**
 * Link Pi branches across imported threads.
 *
 * @param {Object} params
 * @param {Array} params.thread_results -- union of results.created and
 *   results.updated. Each item is shaped { session_id, thread_id, thread_dir,
 *   timeline_entries, ... } as pushed at create-threads-from-session-
 *   provider.mjs:352.
 * @returns {Promise<Object>} summary
 */
export const link_pi_branches = async ({ thread_results = [] } = {}) => {
  const summary = {
    threads_updated: 0,
    relations_added: 0,
    branch_points_resolved: 0,
    branch_points_skipped_multi_sibling: 0,
    parent_session_links_deferred: 0,
    skipped: 0
  }

  if (!Array.isArray(thread_results) || thread_results.length === 0) {
    return summary
  }

  // Read each thread's metadata so we can group by original_session_id.
  const enriched = []
  for (const item of thread_results) {
    if (!item?.thread_dir) {
      summary.skipped++
      continue
    }
    const metadata_path = path.join(item.thread_dir, 'metadata.json')
    let metadata
    try {
      metadata = await read_json_file_or_default({
        file_path: metadata_path,
        default_value: null
      })
    } catch (error) {
      log(`link_pi_branches: failed to read ${metadata_path}: ${error.message}`)
      summary.skipped++
      continue
    }
    if (!metadata) {
      summary.skipped++
      continue
    }
    const provider_metadata =
      metadata?.external_session?.provider_metadata ?? null
    const provider = metadata?.external_session?.provider
    if (provider !== 'pi' || !provider_metadata) {
      summary.skipped++
      continue
    }
    enriched.push({
      ...item,
      metadata,
      metadata_path,
      provider_metadata
    })
  }

  // Group by original_session_id (Pi header id)
  const by_session = new Map()
  for (const e of enriched) {
    const key = e.provider_metadata.original_session_id
    if (!key) continue
    const list = by_session.get(key) || []
    list.push(e)
    by_session.set(key, list)
  }

  for (const [, group] of by_session) {
    if (group.length === 0) continue

    // Resolve primary branch (branch_index 0)
    const primary = group.find(
      (g) => g.provider_metadata.branch_index === 0
    )

    if (primary && group.length > 1) {
      for (const sibling of group) {
        if (sibling === primary) continue
        const added = await add_branched_from_relation({
          source_metadata_path: sibling.metadata_path,
          target_thread_id: primary.thread_id
        })
        if (added) summary.relations_added++
      }
    }

    // Forked-session linkage (header.parentSession) is deferred -- resolving
    // the parent's deterministic thread id requires reading the parent .jsonl
    // from disk to recover its header.id. Surface the count instead of
    // silently dropping the linkage.
    for (const member of group) {
      if (member.provider_metadata.parent_session_path) {
        summary.parent_session_links_deferred++
      }
    }

    // Backfill branch_thread_id on branch_point entries in each thread's
    // timeline. The metadata sibling map gives us the resolution.
    for (const member of group) {
      const sibling_thread_ids = group
        .filter((m) => m !== member)
        .map((m) => m.thread_id)
      const result = await backfill_branch_point_thread_ids({
        thread_dir: member.thread_dir,
        sibling_thread_ids
      })
      summary.branch_points_resolved += result.resolved
      summary.branch_points_skipped_multi_sibling += result.skipped_multi_sibling
      if (result.resolved > 0) summary.threads_updated++
    }
  }

  return summary
}

const add_branched_from_relation = async ({
  source_metadata_path,
  target_thread_id
}) => {
  // Canonical thread base_uri form (matches analyze-thread-relations.mjs and
  // sqlite-relation-queries.mjs index lookups). Do NOT append `.md`.
  const target_uri = `user:thread/${target_thread_id}`
  let added = false
  await write_thread_metadata({
    absolute_path: source_metadata_path,
    audit_context: null,
    modify: (current) => {
      const next = { ...current }
      const relations = Array.isArray(next.relations) ? [...next.relations] : []
      const exists = relations.some((r) => {
        const parsed = parse_relation_string({ relation_string: r })
        return (
          parsed &&
          parsed.relation_type === RELATION_BRANCHED_FROM &&
          parsed.base_uri === target_uri
        )
      })
      if (!exists) {
        relations.push(`${RELATION_BRANCHED_FROM} [[${target_uri}]]`)
        next.relations = relations
        added = true
      }
      return next
    }
  })
  return added
}

const backfill_branch_point_thread_ids = async ({
  thread_dir,
  sibling_thread_ids
}) => {
  const timeline_path = path.join(thread_dir, 'timeline.jsonl')
  const entries = await read_timeline_jsonl({ timeline_path })
  if (!entries) return { resolved: 0, skipped_multi_sibling: 0 }

  // Pi branch_thread_id resolution is intentionally simple: when a thread has
  // exactly one sibling, every branch_point entry resolves to that sibling.
  // Multi-sibling disambiguation (via branch_point's metadata.source_entry_id)
  // is a future enhancement -- for now report the count so importers see what
  // was deferred rather than silently dropping the resolution.
  if (sibling_thread_ids.length !== 1) {
    const branch_point_count = entries.filter(
      (e) => e?.type === 'system' && e?.system_type === 'branch_point'
    ).length
    return { resolved: 0, skipped_multi_sibling: branch_point_count }
  }
  const sibling_id = sibling_thread_ids[0]

  // Provenance gate: write_timeline_jsonl is not a safety net for the closed
  // provenance set. Verify every entry has valid provenance before any
  // rewrite; if any entry is missing/invalid provenance, log and skip.
  for (const entry of entries) {
    if (!is_valid_provenance(entry?.provenance)) {
      log(
        `backfill_branch_point_thread_ids: skipping ${timeline_path} -- entry ${entry?.id ?? '(no id)'} missing or invalid provenance`
      )
      return { resolved: 0, skipped_multi_sibling: 0 }
    }
  }

  let modified = 0
  const new_entries = entries.map((entry) => {
    if (
      entry.type === 'system' &&
      entry.system_type === 'branch_point' &&
      !(entry.metadata && entry.metadata.branch_thread_id)
    ) {
      const next = {
        ...entry,
        metadata: { ...(entry.metadata || {}), branch_thread_id: sibling_id }
      }
      try {
        entry_validators.system(next)
      } catch (error) {
        log(
          `backfill_branch_point_thread_ids: validator rejected entry ${entry.id}: ${error.message}`
        )
        return entry
      }
      modified++
      return next
    }
    return entry
  })

  if (modified > 0) {
    await write_timeline_jsonl({ timeline_path, entries: new_entries })
  }
  return { resolved: modified, skipped_multi_sibling: 0 }
}
