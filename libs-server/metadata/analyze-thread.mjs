import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import {
  run_opencode,
  extract_model_response
} from './run-opencode-analysis.mjs'
import {
  parse_metadata_response,
  generate_analysis_prompt
} from './parse-analysis-output.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'

const log = debug('metadata:analyze')

// ============================================================================
// Constants
// ============================================================================

const ANALYSIS_CONFIG = {
  // Skip messages that are just warmup
  WARMUP_PATTERNS: [/^warmup$/i, /^test$/i, /^hello$/i, /^hi$/i]
}

// ============================================================================
// Timeline Analysis
// ============================================================================

/**
 * Extract the first substantive user message from a thread timeline
 *
 * @param {Array} timeline - Thread timeline array
 * @returns {string|null} First user message content or null
 */
export const extract_first_user_message = (timeline) => {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return null
  }

  // Find user messages
  const user_messages = timeline.filter(
    (entry) => entry.type === 'message' && entry.role === 'user'
  )

  // Filter out warmup/test messages
  for (const message of user_messages) {
    const content = message.content?.trim()
    if (!content) continue

    const is_warmup = ANALYSIS_CONFIG.WARMUP_PATTERNS.some((pattern) =>
      pattern.test(content)
    )

    if (!is_warmup) {
      return content
    }
  }

  return null
}

/**
 * Read timeline from thread directory
 *
 * @param {string} thread_dir - Path to thread directory
 * @returns {Promise<Array>} Timeline array
 */
const read_thread_timeline = async (thread_dir) => {
  const timeline_path = path.join(thread_dir, 'timeline.json')

  try {
    const content = await fs.readFile(timeline_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    log(`Failed to read timeline from ${timeline_path}: ${error.message}`)
    return []
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a thread and generate metadata using OpenCode with local models
 *
 * @param {Object} params
 * @param {string} params.thread_id - UUID of the thread to analyze
 * @param {string} [params.model] - Model to use for analysis
 * @param {boolean} [params.dry_run=false] - If true, don't update the thread
 * @returns {Promise<Object>} Analysis result
 */
export const analyze_thread_for_metadata = async ({
  thread_id,
  model,
  dry_run = false
}) => {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(`Analyzing thread ${thread_id}`)

  // Get thread data
  const thread = await get_thread({ thread_id })

  // Check if metadata already exists
  // Skip if short_description exists (indicates AI analysis was already done)
  // Title alone doesn't count since session import sets a default title from prompt
  if (thread.short_description) {
    log(`Thread ${thread_id} already has metadata, skipping`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'metadata_exists',
      current: {
        title: thread.title,
        short_description: thread.short_description
      }
    }
  }

  // Read timeline
  const timeline = await read_thread_timeline(thread.context_dir)

  // Extract first user message
  const user_message = extract_first_user_message(timeline)

  if (!user_message) {
    log(`No user message found in thread ${thread_id}`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'no_user_message'
    }
  }

  // Generate analysis prompt
  const prompt = generate_analysis_prompt({ user_message })

  // Run OpenCode analysis
  let opencode_result
  try {
    opencode_result = await run_opencode({
      prompt,
      model
    })
  } catch (error) {
    log(`OpenCode failed for thread ${thread_id}: ${error.message}`)
    return {
      thread_id,
      status: 'failed',
      error: error.message
    }
  }

  // Extract model response
  const response_text = extract_model_response(opencode_result.output)

  // Parse metadata from response
  const metadata = parse_metadata_response(response_text)

  if (!metadata.success) {
    log(`Failed to parse metadata for thread ${thread_id}: ${metadata.error}`)
    return {
      thread_id,
      status: 'failed',
      error: metadata.error,
      raw_response: response_text
    }
  }

  // Build update object
  // Always update title with AI-generated version (overwrites default from first prompt)
  // Only update short_description if not already set
  const updates = {}
  if (metadata.title) {
    updates.title = metadata.title
  }
  if (metadata.short_description && !thread.short_description) {
    updates.short_description = metadata.short_description
  }

  if (Object.keys(updates).length === 0) {
    log(`No updates needed for thread ${thread_id}`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'no_updates_needed'
    }
  }

  // Apply update if not dry run
  if (!dry_run) {
    try {
      await update_thread_metadata({
        thread_id,
        metadata: updates
      })
      log(`Updated thread ${thread_id} metadata`)
    } catch (error) {
      log(`Failed to update thread ${thread_id}: ${error.message}`)
      return {
        thread_id,
        status: 'failed',
        error: `Update failed: ${error.message}`,
        updates
      }
    }
  }

  return {
    thread_id,
    status: dry_run ? 'dry_run' : 'updated',
    duration_ms: opencode_result.duration_ms,
    current: {
      title: thread.title,
      short_description: thread.short_description
    },
    updates,
    dry_run
  }
}

export default analyze_thread_for_metadata
