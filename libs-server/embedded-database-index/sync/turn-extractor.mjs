// Emit one turn per non-meta user message: aggregate the user text, the
// following assistant messages, and any Bash tool-call commands.
//
// Streams timeline.jsonl line-by-line so per-thread memory stays bounded
// even for 100+ MB timelines (the v8 migration and any full-rebuild path
// can iterate thousands of threads sequentially without blowing heap).

import { promises as fs, createReadStream } from 'fs'
import { createInterface } from 'readline'
import debug from 'debug'

const log = debug('embedded-index:sync:turn-extractor')

// Warmup / meta patterns that mirror libs-server/metadata/analyze-thread.mjs.
// Kept local to avoid coupling the extractor to the title-analysis module.
const WARMUP_PATTERNS = [
  /^warmup$/i,
  /^test$/i,
  /^hello$/i,
  /^hi$/i,
  /^<command-name>\/\w+<\/command-name>/i,
  /^<local-command-caveat>/i,
  /^<local-command-stdout>/i,
  /^<command-message>/i
]

function extract_text_from_content(content) {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object') {
          if (typeof block.text === 'string') return block.text
          if (block.type === 'text' && typeof block.value === 'string') {
            return block.value
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function is_warmup(text) {
  const trimmed = text.trim()
  if (!trimmed) return true
  return WARMUP_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function extract_bash_command(entry) {
  if (entry?.type !== 'tool_call') return null
  const tool_name = entry.tool_name || entry.name
  if (tool_name !== 'Bash') return null
  const params = entry.tool_input || entry.input || entry.tool_parameters || {}
  const command = typeof params.command === 'string' ? params.command : null
  return command && command.trim() ? command : null
}

function finalize_turn(current) {
  if (!current) return null
  const text = current.parts.filter(Boolean).join('\n\n').trim()
  if (!text) return null
  return {
    turn_index: current.turn_index,
    turn_text: text,
    first_timestamp: current.first_timestamp || null
  }
}

function process_entry({ entry, state }) {
  if (!entry || typeof entry !== 'object') return
  if (entry.metadata?.is_meta === true) return

  if (entry.type === 'message' && entry.role === 'user') {
    const finalized = finalize_turn(state.current)
    if (finalized) state.turns.push(finalized)

    const text = extract_text_from_content(entry.content)
    if (is_warmup(text)) {
      state.current = null
      return
    }

    state.current = {
      turn_index: state.next_turn_index++,
      parts: [text],
      first_timestamp: entry.timestamp || null
    }
    return
  }

  if (!state.current) return

  if (entry.type === 'message' && entry.role === 'assistant') {
    const text = extract_text_from_content(entry.content)
    if (text.trim()) state.current.parts.push(text)
    return
  }

  const bash_command = extract_bash_command(entry)
  if (bash_command) {
    state.current.parts.push(bash_command)
  }
}

/**
 * Extract turns from a thread's timeline.jsonl file.
 *
 * Streams the file line-by-line rather than loading the full parsed timeline
 * into memory; required to keep peak memory bounded for very large timelines.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread identifier (for logging)
 * @param {string} params.timeline_path - Absolute path to timeline.jsonl
 * @returns {Promise<Array<{turn_index: number, turn_text: string, first_timestamp: string|null}>>}
 */
export async function extract_turns_from_timeline({
  thread_id,
  timeline_path
}) {
  try {
    await fs.access(timeline_path)
  } catch {
    log('No timeline file for thread %s', thread_id)
    return []
  }

  const state = {
    turns: [],
    current: null,
    next_turn_index: 0
  }

  let parse_error_count = 0
  let line_number = 0

  const file_stream = createReadStream(timeline_path)
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  try {
    for await (const line of line_reader) {
      line_number++
      if (line.trim() === '') continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch (error) {
        parse_error_count++
        log(
          'Malformed JSON at line %d in %s: %s',
          line_number,
          timeline_path,
          error.message
        )
        continue
      }
      process_entry({ entry, state })
    }
  } finally {
    file_stream.destroy()
    line_reader.close()
  }

  const finalized = finalize_turn(state.current)
  if (finalized) state.turns.push(finalized)

  if (parse_error_count > 0) {
    log(
      'Timeline %s: %d malformed lines skipped out of %d total',
      timeline_path,
      parse_error_count,
      line_number
    )
  }

  return state.turns
}
