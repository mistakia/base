import { createReadStream, createWriteStream, existsSync } from 'fs'
import fs from 'fs/promises'
import { createInterface } from 'readline'
import path from 'path'
import debug from 'debug'

import { sort_timeline_entries } from './sort-timeline-entries.mjs'

const log = debug('threads:timeline:jsonl')
const log_warn = debug('threads:timeline:jsonl:warn')
// Enable warn level by default so parse errors are always visible
log_warn.enabled = true

/**
 * Process a single timeline event to accumulate edit metrics.
 * Shared logic used by both in-memory and streaming metric extraction.
 *
 * @param {Object} event Timeline event to process
 * @param {Object} state Mutable state object with edit_count and total_chars_changed
 */
export function accumulate_edit_metrics_from_event(event, state) {
  if (event.type !== 'tool_result') {
    return
  }

  const tool_name = event.tool_name || event.name
  if (tool_name !== 'Edit' && tool_name !== 'Write') {
    return
  }

  state.edit_count++

  const tool_input = event.tool_input || event.input || {}
  if (tool_name === 'Edit') {
    const old_len = (tool_input.old_string || '').length
    const new_len = (tool_input.new_string || '').length
    state.total_chars_changed += Math.max(old_len, new_len)
  } else if (tool_name === 'Write') {
    state.total_chars_changed += (tool_input.content || '').length
  }
}

/**
 * Read timeline entries from a JSONL file using streaming
 * Parses line-by-line to reduce memory pressure compared to JSON.parse of entire file
 *
 * @param {Object} params Parameters
 * @param {string} params.timeline_path Path to the timeline.jsonl file
 * @returns {Promise<Array|null>} Array of timeline entries, or null if file doesn't exist
 */
export async function read_timeline_jsonl({ timeline_path }) {
  if (!existsSync(timeline_path)) {
    log(`Timeline file not found: ${timeline_path}`)
    return null
  }

  const entries = []
  let line_number = 0

  const file_stream = createReadStream(timeline_path)
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  let parse_error_count = 0

  for await (const line of line_reader) {
    line_number++

    if (line.trim() === '') {
      continue
    }

    try {
      const entry = JSON.parse(line)
      entries.push(entry)
    } catch (parse_error) {
      parse_error_count++
      log_warn(
        `Malformed JSON at line ${line_number} in ${timeline_path}: ${parse_error.message}`
      )
      // Continue processing other lines
    }
  }

  if (parse_error_count > 0) {
    log_warn(
      `Timeline ${timeline_path}: ${parse_error_count} malformed lines skipped out of ${line_number} total lines`
    )
  }

  // Sort entries by timestamp (primary) with ordering.sequence as tie-breaker
  sort_timeline_entries(entries)

  log(`Read ${entries.length} entries from ${timeline_path}`)
  return entries
}

/**
 * Write timeline entries to a JSONL file with atomic rename
 * Uses streaming writes to reduce memory pressure for large timelines
 * Uses a temporary file to ensure write completes before replacing original
 *
 * @param {Object} params Parameters
 * @param {string} params.timeline_path Path to the timeline.jsonl file
 * @param {Array} params.entries Array of timeline entries to write
 * @returns {Promise<void>}
 */
export async function write_timeline_jsonl({ timeline_path, entries }) {
  const temp_path = `${timeline_path}.tmp.${Date.now()}`
  const dir = path.dirname(timeline_path)

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true })

  try {
    // Use streaming writes to reduce memory pressure for large timelines
    await new Promise((resolve, reject) => {
      const write_stream = createWriteStream(temp_path, { encoding: 'utf-8' })

      write_stream.on('error', reject)
      write_stream.on('finish', resolve)

      for (const entry of entries) {
        write_stream.write(JSON.stringify(entry) + '\n')
      }

      write_stream.end()
    })

    // Atomic rename
    await fs.rename(temp_path, timeline_path)

    log(`Wrote ${entries.length} entries to ${timeline_path}`)
  } catch (error) {
    // Clean up temp file on error
    await fs.unlink(temp_path).catch(() => {
      // Ignore cleanup errors
    })
    throw error
  }
}

/**
 * Append a single entry to a JSONL timeline file
 * Main performance optimization - avoids read-modify-write cycle
 *
 * Uses simple append with trailing newline. The write_timeline_jsonl function
 * guarantees files end with newlines, and this function maintains that invariant.
 *
 * @param {Object} params Parameters
 * @param {string} params.timeline_path Path to the timeline.jsonl file
 * @param {Object} params.entry Timeline entry to append
 * @returns {Promise<void>}
 */
export async function append_timeline_entry_jsonl({ timeline_path, entry }) {
  const dir = path.dirname(timeline_path)

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true })

  const line = JSON.stringify(entry) + '\n'
  await fs.appendFile(timeline_path, line, 'utf-8')
  log(`Appended entry to ${timeline_path}`)
}

/**
 * Read timeline entries or return default if file doesn't exist
 *
 * @param {Object} params Parameters
 * @param {string} params.timeline_path Path to the timeline.jsonl file
 * @param {*} [params.default_value=[]] Default value if file doesn't exist
 * @returns {Promise<Array|*>} Array of timeline entries or default value
 */
export async function read_timeline_jsonl_or_default({
  timeline_path,
  default_value = []
}) {
  const result = await read_timeline_jsonl({ timeline_path })
  return result ?? default_value
}

/**
 * Stream timeline JSONL and extract metrics without loading full timeline into memory.
 * Used for index rebuild to avoid memory pressure with thousands of threads.
 *
 * Returns:
 * - latest_event: The last non-system event (for latest_event_timestamp, type, data)
 * - edit_count: Number of Edit/Write tool_result events
 * - lines_changed: Estimated lines changed (chars / 80)
 *
 * @param {Object} params Parameters
 * @param {string} params.timeline_path Path to the timeline.jsonl file
 * @returns {Promise<Object>} Metrics object with latest_event, edit_count, lines_changed
 */
export async function extract_timeline_metrics_streaming({ timeline_path }) {
  if (!existsSync(timeline_path)) {
    log(`Timeline file not found: ${timeline_path}`)
    return {
      latest_event: null,
      edit_count: 0,
      lines_changed: 0
    }
  }

  let latest_event = null
  const metrics_state = { edit_count: 0, total_chars_changed: 0 }

  const file_stream = createReadStream(timeline_path)
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  try {
    for await (const line of line_reader) {
      if (line.trim() === '') {
        continue
      }

      try {
        const event = JSON.parse(line)

        // Track latest non-system event (replace as we find newer ones)
        if (event.type !== 'system') {
          latest_event = event
        }

        // Accumulate edit metrics using shared helper
        accumulate_edit_metrics_from_event(event, metrics_state)
      } catch {
        // Skip malformed lines silently in streaming mode
      }
    }
  } finally {
    file_stream.destroy()
    line_reader.close()
  }

  const lines_changed = Math.ceil(metrics_state.total_chars_changed / 80)

  log(
    `Extracted metrics from ${timeline_path}: edit_count=${metrics_state.edit_count}, lines_changed=${lines_changed}`
  )

  return {
    latest_event,
    edit_count: metrics_state.edit_count,
    lines_changed
  }
}
