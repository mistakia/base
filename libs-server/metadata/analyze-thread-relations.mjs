/**
 * Analyze thread relations
 *
 * Orchestrates extraction of entity references from thread timeline.
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
import { extract_timeline_references_separated } from './extract-timeline-references.mjs'

const log = debug('metadata:analyze-relations')

// ============================================================================
// Constants
// ============================================================================

export const RELATION_ANALYSIS_CONFIG = {
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
 * @param {boolean} [params.force=false] - Force re-analysis even if already analyzed
 * @returns {Promise<Object>} Analysis result
 */
export async function analyze_thread_relations({
  thread_id,
  dry_run = false,
  force = false
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(`Analyzing relations for thread ${thread_id}`)

  // Load thread data
  const { metadata, timeline } = await read_thread_data({ thread_id })

  // Check if already analyzed (unless force is true)
  if (metadata.relations_analyzed_at && !force) {
    log(
      `Thread ${thread_id} already analyzed at ${metadata.relations_analyzed_at}`
    )
    return {
      thread_id,
      status: 'already_analyzed',
      relations_analyzed_at: metadata.relations_analyzed_at
    }
  }

  if (force && metadata.relations_analyzed_at) {
    log(
      `Force re-analyzing thread ${thread_id} (previously analyzed at ${metadata.relations_analyzed_at})`
    )
  }

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
