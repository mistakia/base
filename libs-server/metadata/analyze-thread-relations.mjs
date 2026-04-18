/**
 * Analyze thread relations
 *
 * Orchestrates extraction of entity references from thread timeline.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  RELATION_ACCESSES,
  RELATION_MODIFIES,
  RELATION_CREATES,
  RELATION_RELATES_TO,
  RELATION_CONTINUED_FROM
} from '#libs-shared/entity-relations.mjs'
import { is_valid_base_uri } from '#libs-shared/relation-validator.mjs'
import { read_thread_data } from '#libs-server/threads/thread-utils.mjs'
import {
  list_thread_ids,
  get_thread_metadata
} from '#libs-server/threads/list-threads.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import { extract_timeline_references_separated } from './extract-timeline-references.mjs'

const log = debug('metadata:analyze-relations')

// ============================================================================
// Constants
// ============================================================================

/**
 * Resolve a queue path from config. Absolute paths are used as-is; relative
 * paths are joined against `config.user_base_directory`. Falls back to the
 * legacy `/tmp/` location when no config is present (e.g. fresh checkout).
 */
const resolve_relation_queue_path = () => {
  const configured = config.metadata_queue?.relation_queue_file_path
  const fallback = '/tmp/claude-pending-relation-analysis.queue'
  if (!configured) return fallback
  if (path.isAbsolute(configured)) return configured
  if (config.user_base_directory) {
    return path.join(config.user_base_directory, configured)
  }
  return fallback
}

export const RELATION_ANALYSIS_CONFIG = {
  get QUEUE_FILE_PATH() {
    return resolve_relation_queue_path()
  }
}

// ============================================================================
// Continuation detection constants and helpers
// ============================================================================

const CONTINUATION_WINDOW_DAYS = 14
const CONTINUATION_SHINGLE_K = 8
const CONTINUATION_MIN_SHINGLES = 20
const CONTINUATION_THRESHOLD = 0.3
const CONTINUATION_SLOW_RUN_WARN_MS = 10000
const CONTINUATION_FS_CONCURRENCY = 32
const MS_PER_DAY = 86400000

async function map_with_concurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export function normalize_text(text) {
  if (typeof text !== 'string' || text.length === 0) return ''
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function build_shingles({ text, k = CONTINUATION_SHINGLE_K }) {
  const normalized = normalize_text(text)
  if (!normalized) return new Set()
  const tokens = normalized.split(' ').filter(Boolean)
  const out = new Set()
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(tokens.slice(i, i + k).join(' '))
  }
  return out
}

export function extract_first_user_prompt({ timeline }) {
  if (!Array.isArray(timeline)) return null
  for (const event of timeline) {
    if (
      event &&
      event.type === 'message' &&
      event.role === 'user' &&
      typeof event.content === 'string'
    ) {
      return event.content
    }
  }
  return null
}

export function extract_assistant_text({ timeline }) {
  if (!Array.isArray(timeline)) return ''
  const parts = []
  for (const event of timeline) {
    if (
      event &&
      event.type === 'message' &&
      event.role === 'assistant' &&
      typeof event.content === 'string'
    ) {
      parts.push(event.content)
    }
  }
  return parts.join('\n\n')
}

export function score_continuation_coverage({
  candidate_shingles,
  source_shingles
}) {
  if (!candidate_shingles || candidate_shingles.size === 0) return 0
  if (!source_shingles || source_shingles.size === 0) return 0
  let intersection = 0
  for (const shingle of candidate_shingles) {
    if (source_shingles.has(shingle)) intersection++
  }
  return intersection / candidate_shingles.size
}

/**
 * Detect prior threads whose assistant text was pasted as this thread's first
 * user prompt. Scans prior threads inside a bounded recent-updates window and
 * measures candidate-side shingle coverage.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Analyzed thread ID (excluded from candidates)
 * @param {Array} params.timeline - Timeline of the analyzed thread
 * @param {string} params.analyzed_created_at - ISO timestamp of analyzed thread's creation
 * @param {string} [params.user_base_directory] - Override for tests
 * @returns {Promise<Array<{source_thread_id: string, coverage: number}>>}
 */
export async function detect_continuation_source({
  thread_id,
  timeline,
  analyzed_created_at,
  user_base_directory
}) {
  const prompt = extract_first_user_prompt({ timeline })
  if (!prompt) return []

  const candidate_shingles = build_shingles({ text: prompt })
  if (candidate_shingles.size < CONTINUATION_MIN_SHINGLES) return []

  const analyzed_created_ms = new Date(analyzed_created_at).getTime()
  if (Number.isNaN(analyzed_created_ms)) return []

  const all_ids = await list_thread_ids({ user_base_directory })
  const candidate_ids = all_ids.filter((id) => id !== thread_id)

  const window_candidates = []
  await map_with_concurrency(
    candidate_ids,
    CONTINUATION_FS_CONCURRENCY,
    async (candidate_id) => {
      const metadata = await get_thread_metadata({
        thread_id: candidate_id,
        user_base_directory
      })
      if (!metadata) return

      const source_created_ms = metadata.created_at
        ? new Date(metadata.created_at).getTime()
        : NaN
      if (Number.isNaN(source_created_ms)) return
      if (source_created_ms > analyzed_created_ms) return

      const source_updated_ms = metadata.updated_at
        ? new Date(metadata.updated_at).getTime()
        : source_created_ms
      const window_end_ms =
        (Number.isNaN(source_updated_ms) ? source_created_ms : source_updated_ms) +
        CONTINUATION_WINDOW_DAYS * MS_PER_DAY
      if (window_end_ms < analyzed_created_ms) return

      window_candidates.push(candidate_id)
    }
  )

  const matches = []
  await map_with_concurrency(
    window_candidates,
    CONTINUATION_FS_CONCURRENCY,
    async (candidate_id) => {
      let source_timeline
      try {
        const data = await read_thread_data({
          thread_id: candidate_id,
          user_base_directory
        })
        source_timeline = data.timeline
      } catch (error) {
        log(`Skipping candidate ${candidate_id}: ${error.message}`)
        return
      }

      const source_shingles = build_shingles({
        text: extract_assistant_text({ timeline: source_timeline })
      })
      const coverage = score_continuation_coverage({
        candidate_shingles,
        source_shingles
      })
      if (coverage >= CONTINUATION_THRESHOLD) {
        matches.push({ source_thread_id: candidate_id, coverage })
      }
    }
  )

  matches.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage
    return a.source_thread_id < b.source_thread_id ? -1 : 1
  })
  return matches
}

/**
 * Maps access types to relation types
 */
const ACCESS_TYPE_TO_RELATION = {
  read: RELATION_ACCESSES,
  modify: RELATION_MODIFIES,
  create: RELATION_CREATES,
  reference: RELATION_RELATES_TO,
  delete: RELATION_MODIFIES // Treat delete as modify for relation purposes
}

/**
 * Build relations array from extracted references
 * @param {Object} params
 * @param {Array} params.references - Extracted references with base_uri and access_type
 * @returns {Array<string>} Array of formatted relation strings
 */
function build_entity_relations({ references }) {
  const relations = []

  for (const ref of references) {
    // Skip invalid base_uris
    if (!is_valid_base_uri({ base_uri: ref.base_uri })) {
      log(`Skipping invalid base_uri: ${ref.base_uri}`)
      continue
    }

    const relation_type = ACCESS_TYPE_TO_RELATION[ref.access_type]
    if (!relation_type) {
      log(`Unknown access type: ${ref.access_type}`)
      continue
    }

    relations.push(`${relation_type} [[${ref.base_uri}]]`)
  }

  return relations
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Add a thread to the relation analysis queue
 * @param {string} thread_id - Thread ID to queue
 * @returns {Promise<void>}
 */
export async function queue_relation_analysis(thread_id) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  const queue_path = RELATION_ANALYSIS_CONFIG.QUEUE_FILE_PATH

  try {
    // Read existing queue
    let existing = ''
    try {
      existing = await fs.readFile(queue_path, 'utf-8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    // Check if already queued
    const lines = existing.split('\n').filter((l) => l.trim())
    if (lines.includes(thread_id)) {
      log(`Thread ${thread_id} already in relation analysis queue`)
      return
    }

    // Append to queue
    await fs.appendFile(queue_path, `${thread_id}\n`, 'utf-8')
    log(`Queued thread ${thread_id} for relation analysis`)
  } catch (error) {
    log(`Failed to queue thread for relation analysis: ${error.message}`)
    throw error
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze thread relations
 *
 * Extracts entity references from timeline.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to analyze
 * @param {boolean} [params.dry_run=false] - If true, don't update metadata
 * @param {boolean} [params.force=false] - Vestigial; analysis always runs now. Retained so backfill's `--update-entities` subprocess path can keep passing `--force` without breakage.
 * @returns {Promise<Object>} Analysis result
 */
export async function analyze_thread_relations({
  thread_id,
  dry_run = false,
  // eslint-disable-next-line no-unused-vars
  force = false
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(`Analyzing relations for thread ${thread_id}`)

  // Load thread data
  const { metadata: analyzed_metadata, timeline } = await read_thread_data({
    thread_id
  })

  // Extract all references from timeline, separated by type
  const { entity_references, file_references, directory_references } =
    extract_timeline_references_separated({ timeline })

  log(
    `Extracted ${entity_references.length} entity refs, ${file_references.length} file refs, ${directory_references.length} dir refs`
  )

  // Build entity relations
  const entity_relations = build_entity_relations({
    references: entity_references
  })

  // Detect thread continuation source
  const t_continuation_start = Date.now()
  const continuation_matches = await detect_continuation_source({
    thread_id,
    timeline,
    analyzed_created_at: analyzed_metadata.created_at
  })
  const continuation_ms = Date.now() - t_continuation_start
  if (continuation_ms > CONTINUATION_SLOW_RUN_WARN_MS) {
    log(
      'continuation detection slow: %dms for %s',
      continuation_ms,
      thread_id
    )
  }

  for (const match of continuation_matches) {
    const base_uri = `user:thread/${match.source_thread_id}.md`
    if (!is_valid_base_uri({ base_uri })) {
      log(`Skipping invalid continuation base_uri: ${base_uri}`)
      continue
    }
    entity_relations.push(`${RELATION_CONTINUED_FROM} [[${base_uri}]]`)
  }

  // Extract file base_uris for storage
  const file_base_uris = file_references.map((ref) => ref.base_uri)
  const directory_base_uris = directory_references.map((ref) => ref.base_uri)

  // Prepare result
  const result = {
    thread_id,
    status: 'success',
    entity_references_count: entity_references.length,
    entity_relations_count: entity_relations.length,
    file_references_count: file_references.length,
    directory_references_count: directory_references.length,
    total_relations_count: entity_relations.length,
    relations: entity_relations,
    file_references: file_base_uris,
    directory_references: directory_base_uris,
    continuation_matches,
    dry_run
  }

  // Update thread metadata (unless dry run)
  if (!dry_run) {
    const metadata_update = {
      relations: entity_relations,
      file_references: file_base_uris,
      directory_references: directory_base_uris,
      relations_analyzed_at: new Date().toISOString()
    }

    await update_thread_metadata({
      thread_id,
      metadata: metadata_update
    })

    log(
      `Updated thread ${thread_id} with ${entity_relations.length} relations, ${file_base_uris.length} file refs, ${directory_base_uris.length} dir refs`
    )
    result.metadata_updated = true
  }

  return result
}

export default analyze_thread_relations
