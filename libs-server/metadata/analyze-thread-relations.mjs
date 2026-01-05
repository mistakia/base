/**
 * Analyze thread relations
 *
 * Orchestrates extraction of entity references from thread timeline
 * and discovery of related threads using LLM classification.
 */

import fs from 'fs/promises'
import debug from 'debug'

import {
  RELATION_ACCESSES,
  RELATION_MODIFIES,
  RELATION_CREATES,
  RELATION_RELATES_TO
} from '#libs-shared/entity-relations.mjs'
import { read_thread_data } from '#libs-server/threads/thread-utils.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import list_threads from '#libs-server/threads/list-threads.mjs'
import { extract_timeline_references } from './extract-timeline-references.mjs'
import { find_related_threads } from './find-related-threads.mjs'

const log = debug('metadata:analyze-relations')

// ============================================================================
// Constants
// ============================================================================

export const RELATION_ANALYSIS_CONFIG = {
  RECENT_THREADS_DAYS: 30,
  MAX_CANDIDATE_THREADS: 50,
  QUEUE_FILE_PATH: '/tmp/claude-pending-relation-analysis.queue'
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

// ============================================================================
// Relation Formatting
// ============================================================================

/**
 * Format a relation string
 * @param {string} relation_type - Relation type constant
 * @param {string} base_uri - Target entity base URI
 * @returns {string} Formatted relation string
 */
function format_relation(relation_type, base_uri) {
  return `${relation_type} [[${base_uri}]]`
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
    const relation_type = ACCESS_TYPE_TO_RELATION[ref.access_type]
    if (!relation_type) {
      log(`Unknown access type: ${ref.access_type}`)
      continue
    }

    relations.push(format_relation(relation_type, ref.base_uri))
  }

  return relations
}

/**
 * Build relations array from related thread IDs
 * @param {Object} params
 * @param {Array<string>} params.related_thread_ids - Array of related thread IDs
 * @returns {Array<string>} Array of formatted relation strings
 */
function build_thread_relations({ related_thread_ids }) {
  return related_thread_ids.map((thread_id) =>
    format_relation(RELATION_RELATES_TO, `thread:${thread_id}`)
  )
}

// ============================================================================
// Recent Threads Gathering
// ============================================================================

/**
 * Get recent threads for comparison
 * @param {Object} params
 * @param {string} params.thread_id - Current thread ID to exclude
 * @param {number} [params.days] - Number of days to look back
 * @param {number} [params.limit] - Maximum threads to return
 * @returns {Promise<Array>} Array of thread metadata
 */
async function get_recent_threads({
  thread_id,
  days = RELATION_ANALYSIS_CONFIG.RECENT_THREADS_DAYS,
  limit = RELATION_ANALYSIS_CONFIG.MAX_CANDIDATE_THREADS
}) {
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const threads = await list_threads({
    updated_since: since_date.toISOString(),
    limit: limit + 1 // +1 to account for excluding current thread
  })

  // Filter out current thread and ensure we have title/description
  return threads
    .filter((t) => t.thread_id !== thread_id)
    .filter((t) => t.title || t.short_description)
    .slice(0, limit)
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
 * Extracts entity references from timeline and discovers related threads
 * using LLM classification.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to analyze
 * @param {boolean} [params.dry_run=false] - If true, don't update metadata
 * @param {boolean} [params.skip_related_threads=false] - Skip LLM thread discovery
 * @returns {Promise<Object>} Analysis result
 */
export async function analyze_thread_relations({
  thread_id,
  dry_run = false,
  skip_related_threads = false
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(`Analyzing relations for thread ${thread_id}`)

  // Load thread data
  const { metadata, timeline } = await read_thread_data({ thread_id })

  // Check if already analyzed
  if (metadata.relations_analyzed_at) {
    log(
      `Thread ${thread_id} already analyzed at ${metadata.relations_analyzed_at}`
    )
    return {
      thread_id,
      status: 'already_analyzed',
      relations_analyzed_at: metadata.relations_analyzed_at
    }
  }

  // Extract entity references from timeline
  const { references } = extract_timeline_references({ timeline })
  log(`Extracted ${references.length} entity references`)

  // Build entity relations
  const entity_relations = build_entity_relations({ references })

  // Find related threads (unless skipped)
  let thread_relations = []
  let related_threads_duration_ms = 0

  if (!skip_related_threads && metadata.title) {
    try {
      const recent_threads = await get_recent_threads({ thread_id })
      log(`Found ${recent_threads.length} recent threads for comparison`)

      if (recent_threads.length > 0) {
        const result = await find_related_threads({
          thread: metadata,
          recent_threads
        })
        thread_relations = build_thread_relations({
          related_thread_ids: result.related_thread_ids
        })
        related_threads_duration_ms = result.duration_ms
        log(`Found ${result.related_thread_ids.length} related threads`)
      }
    } catch (error) {
      log(`Error finding related threads: ${error.message}`)
      // Continue without related threads - don't fail the whole analysis
    }
  }

  // Combine all relations
  const all_relations = [...entity_relations, ...thread_relations]

  // Prepare result
  const result = {
    thread_id,
    status: 'success',
    entity_references_count: references.length,
    entity_relations_count: entity_relations.length,
    thread_relations_count: thread_relations.length,
    total_relations_count: all_relations.length,
    related_threads_duration_ms,
    relations: all_relations,
    dry_run
  }

  // Update thread metadata (unless dry run)
  if (!dry_run) {
    const metadata_update = {
      relations: all_relations,
      relations_analyzed_at: new Date().toISOString()
    }

    await update_thread_metadata({
      thread_id,
      metadata: metadata_update
    })

    log(`Updated thread ${thread_id} with ${all_relations.length} relations`)
    result.metadata_updated = true
  }

  return result
}

export default analyze_thread_relations
