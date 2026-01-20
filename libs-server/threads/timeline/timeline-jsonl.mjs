import { createReadStream, createWriteStream, existsSync } from 'fs'
import fs from 'fs/promises'
import { createInterface } from 'readline'
import path from 'path'
import debug from 'debug'

const log = debug('threads:timeline:jsonl')
const log_warn = debug('threads:timeline:jsonl:warn')
// Enable warn level by default so parse errors are always visible
log_warn.enabled = true

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
