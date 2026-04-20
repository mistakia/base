import path from 'path'
import debug from 'debug'

import {
  run_model_prompt,
  extract_model_response
} from './run-model-prompt.mjs'
import { parse_metadata_response } from './parse-analysis-output.mjs'
import {
  generate_title_prompt,
  TITLE_PROMPT_VERSION,
  TITLE_OUTPUT_SCHEMA,
  TITLE_GENERATION_MODEL
} from './generate-title-prompt.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/index.mjs'

const log = debug('metadata:analyze')

// ============================================================================
// Constants
// ============================================================================

const ANALYSIS_CONFIG = {
  // Skip messages that carry no user intent. Claude Code injects
  // `<local-command-caveat>` and `<local-command-stdout>` wrappers around
  // slash-command invocations; without filtering these the model receives
  // only meta-chrome and fabricates titles from the prompt's own examples.
  WARMUP_PATTERNS: [
    /^warmup$/i,
    /^test$/i,
    /^hello$/i,
    /^hi$/i,
    /^<command-name>\/\w+<\/command-name>/i,
    /^<local-command-caveat>/i,
    /^<local-command-stdout>/i,
    /^<command-message>/i
  ]
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

  // Find user messages, excluding meta entries (caveats, command plumbing)
  const user_messages = timeline.filter(
    (entry) =>
      entry.type === 'message' &&
      entry.role === 'user' &&
      !entry.metadata?.is_meta
  )

  // Filter out warmup/test messages
  for (const message of user_messages) {
    // Handle both string content and array content (some messages have content as array)
    let content = message.content
    if (Array.isArray(content)) {
      // Extract text from content blocks
      content = content
        .filter((block) => typeof block === 'string' || block?.type === 'text')
        .map((block) => (typeof block === 'string' ? block : block.text))
        .join('')
    }
    content = typeof content === 'string' ? content.trim() : null
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
 * Extract multiple substantive user messages from a thread timeline
 *
 * Returns concatenated content from the first N non-warmup user messages,
 * within a character budget. This provides better context than a single
 * message for multi-topic sessions.
 *
 * @param {Array} timeline - Thread timeline array
 * @param {Object} [options]
 * @param {number} [options.max_count=3] - Maximum number of messages to extract
 * @param {number} [options.max_chars=12000] - Maximum total characters
 * @returns {string|null} Concatenated user messages or null
 */
export const extract_user_messages = (
  timeline,
  { max_count = 3, max_chars = 12000 } = {}
) => {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return null
  }

  const user_messages = timeline.filter(
    (entry) =>
      entry.type === 'message' &&
      entry.role === 'user' &&
      !entry.metadata?.is_meta
  )

  const extracted = []
  let total_chars = 0

  for (const message of user_messages) {
    if (extracted.length >= max_count) break
    if (total_chars >= max_chars) break

    let content = message.content
    if (Array.isArray(content)) {
      content = content
        .filter((block) => typeof block === 'string' || block?.type === 'text')
        .map((block) => (typeof block === 'string' ? block : block.text))
        .join('')
    }
    content = typeof content === 'string' ? content.trim() : null
    if (!content) continue

    const is_warmup = ANALYSIS_CONFIG.WARMUP_PATTERNS.some((pattern) =>
      pattern.test(content)
    )
    if (is_warmup) continue

    const remaining = max_chars - total_chars
    const truncated =
      content.length > remaining ? content.substring(0, remaining) : content
    extracted.push(truncated)
    total_chars += truncated.length
  }

  return extracted.length > 0 ? extracted.join('\n\n---\n\n') : null
}

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

  // Check if metadata already exists AND was produced by the current prompt
  // version. Threads analyzed with an older prompt version become re-eligible
  // for regeneration, mirroring the tag-classification version-gate pattern.
  if (
    thread.title &&
    thread.short_description &&
    thread.title_prompt_version === TITLE_PROMPT_VERSION
  ) {
    log(
      `Thread ${thread_id} already has metadata at v${TITLE_PROMPT_VERSION}, skipping`
    )
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

  if (thread.title && thread.short_description) {
    log(
      `Thread ${thread_id} re-eligible: prompt v${thread.title_prompt_version || '?'}->${TITLE_PROMPT_VERSION}`
    )
  }

  // Read timeline
  const timeline = await read_thread_timeline(thread.context_dir)

  // Extract user messages (up to 3, within 12K char budget). Multi-message
  // context produces stronger titles on multi-turn sessions where the first
  // message is terse but later messages reveal the actual work.
  const user_message = extract_user_messages(timeline)

  if (!user_message) {
    log(`No user message found in thread ${thread_id}`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'no_user_message'
    }
  }

  // Generate analysis prompt
  const prompt = generate_title_prompt({ user_message })

  // Run OpenCode analysis with Ollama-structured JSON output to eliminate
  // free-text parse failures. The `format` param is ignored on the OpenCode
  // code path.
  let model_result
  try {
    model_result = await run_model_prompt({
      prompt,
      model: model || TITLE_GENERATION_MODEL,
      format: TITLE_OUTPUT_SCHEMA
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
  const response_text = extract_model_response(model_result.output)

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
  // Update short_description on every run so version-gated regeneration can
  // refresh stale descriptions, not just backfill missing ones.
  const updates = {}
  if (metadata.title) {
    updates.title = metadata.title
  }
  if (metadata.short_description) {
    updates.short_description = metadata.short_description
  }
  if (metadata.title || metadata.short_description) {
    updates.title_prompt_version = TITLE_PROMPT_VERSION
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
    duration_ms: model_result.duration_ms,
    current: {
      title: thread.title,
      short_description: thread.short_description
    },
    updates,
    dry_run
  }
}

export default analyze_thread_for_metadata
