// Emit one turn per non-meta user message: aggregate the user text, the
// following assistant messages, and any Bash tool-call commands.

import debug from 'debug'

import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/index.mjs'

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

/**
 * Extract turns from a thread's timeline.jsonl file.
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
  const timeline = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })

  if (!Array.isArray(timeline) || timeline.length === 0) {
    log('No timeline entries for thread %s', thread_id)
    return []
  }

  const turns = []
  let current = null
  let next_turn_index = 0

  for (const entry of timeline) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.metadata?.is_meta === true) continue

    if (entry.type === 'message' && entry.role === 'user') {
      const finalized = finalize_turn(current)
      if (finalized) turns.push(finalized)

      const text = extract_text_from_content(entry.content)
      if (is_warmup(text)) {
        current = null
        continue
      }

      current = {
        turn_index: next_turn_index++,
        parts: [text],
        first_timestamp: entry.timestamp || null
      }
      continue
    }

    if (!current) continue

    if (entry.type === 'message' && entry.role === 'assistant') {
      const text = extract_text_from_content(entry.content)
      if (text.trim()) current.parts.push(text)
      continue
    }

    const bash_command = extract_bash_command(entry)
    if (bash_command) {
      current.parts.push(bash_command)
    }
  }

  const finalized = finalize_turn(current)
  if (finalized) turns.push(finalized)

  return turns
}

