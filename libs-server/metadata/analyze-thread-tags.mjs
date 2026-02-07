import path from 'path'
import debug from 'debug'

import {
  run_opencode,
  extract_model_response
} from './run-opencode-analysis.mjs'
import {
  load_tags_with_content,
  generate_tag_analysis_prompt,
  parse_tag_analysis_response
} from './generate-tag-prompt.mjs'
import { extract_first_user_message } from './analyze-thread.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import config from '#config'

const log = debug('metadata:analyze-tags')

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_PUBLIC_KEY = config.user_public_key

// ============================================================================
// Timeline Reading
// ============================================================================

/**
 * Read timeline from thread directory
 *
 * @param {string} thread_dir - Path to thread directory
 * @returns {Promise<Array>} Timeline array
 */
const read_thread_timeline = async (thread_dir) => {
  const timeline_path = path.join(thread_dir, 'timeline.jsonl')

  try {
    return await read_timeline_jsonl_or_default({
      timeline_path,
      default_value: []
    })
  } catch (error) {
    log(`Failed to read timeline from ${timeline_path}: ${error.message}`)
    return []
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a thread and assign tags using local LLM
 *
 * @param {Object} params
 * @param {string} params.thread_id - UUID of the thread to analyze
 * @param {string} [params.model] - Model to use for analysis
 * @param {boolean} [params.dry_run=false] - If true, don't update the thread
 * @param {boolean} [params.force=false] - If true, analyze even if already analyzed
 * @param {string} [params.user_public_key] - User public key for tag lookup
 * @returns {Promise<Object>} Analysis result
 */
export const analyze_thread_for_tags = async ({
  thread_id,
  model,
  dry_run = false,
  force = false,
  user_public_key = DEFAULT_USER_PUBLIC_KEY
}) => {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!user_public_key) {
    throw new Error('user_public_key is required')
  }

  log(`Analyzing thread ${thread_id} for tags`)

  // Get thread data
  const thread = await get_thread({ thread_id })

  // Check if tags were manually set by user
  if (thread.tags_user_set === true) {
    log(`Thread ${thread_id} has user-set tags, skipping`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'tags_user_set',
      current_tags: thread.tags || []
    }
  }

  // Check if already analyzed (unless force is set)
  if (!force && thread.tags_analyzed_at) {
    log(`Thread ${thread_id} already analyzed at ${thread.tags_analyzed_at}`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'already_analyzed',
      analyzed_at: thread.tags_analyzed_at,
      current_tags: thread.tags || []
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

  // Load available tags
  const available_tags = await load_tags_with_content({ user_public_key })

  if (available_tags.length === 0) {
    log('No tags available for analysis')
    return {
      thread_id,
      status: 'skipped',
      reason: 'no_tags_available'
    }
  }

  // Generate analysis prompt
  const prompt = generate_tag_analysis_prompt({
    user_message,
    title: thread.title,
    short_description: thread.short_description,
    tags: available_tags
  })

  // Run analysis
  let opencode_result
  try {
    opencode_result = await run_opencode({
      prompt,
      model
    })
  } catch (error) {
    log(`Analysis failed for thread ${thread_id}: ${error.message}`)
    return {
      thread_id,
      status: 'failed',
      error: error.message
    }
  }

  // Extract and parse response
  const response_text = extract_model_response(opencode_result.output)
  const parse_result = parse_tag_analysis_response(
    response_text,
    available_tags
  )

  if (!parse_result.success) {
    log(`Failed to parse tags for thread ${thread_id}: ${parse_result.error}`)
    return {
      thread_id,
      status: 'failed',
      error: parse_result.error,
      raw_response: response_text
    }
  }

  // Build update object
  const updates = {
    tags: parse_result.tags,
    tags_analyzed_at: new Date().toISOString()
  }

  // Apply update if not dry run
  if (!dry_run) {
    try {
      await update_thread_metadata({
        thread_id,
        metadata: updates
      })
      log(`Updated thread ${thread_id} with ${parse_result.tags.length} tags`)
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
    previous_tags: thread.tags || [],
    updates,
    reasoning: parse_result.reasoning,
    dry_run
  }
}

export default analyze_thread_for_tags
