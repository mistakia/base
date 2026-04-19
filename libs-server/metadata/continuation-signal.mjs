/**
 * Continuation-signal vocabulary and detection helpers.
 *
 * Two functions over a single shared vocabulary:
 *
 *   has_continuation_signal(text) -> boolean
 *     True when `text` contains at least one continuation-prompt marker
 *     (fence marker, structural header, narrative phrase, or `Continuation:`
 *     line prefix). Case-insensitive.
 *
 *   count_continuation_prompts(text) -> integer
 *     Count of distinct continuation prompts:
 *       - one per fenced block (`~~~...~~~` or triple-backtick...triple-backtick)
 *         whose inner content matches the signal vocabulary;
 *       - plus standalone `Continuation:` line-prefix occurrences that are not
 *         already inside a counted fenced block.
 *
 * Updates to the vocabulary are a one-line change to CONTINUATION_SIGNAL_PATTERNS.
 */

/**
 * Single source of truth for continuation-prompt signals. Each entry is a
 * case-insensitive regex fragment; the fragments are joined into a single
 * alternation for efficient scanning. Fence markers (~~~ and triple-backtick)
 * are recognised by dedicated fence-matching logic in count_continuation_prompts
 * and are also included here so has_continuation_signal returns true on a bare
 * fenced block without narrative phrasing.
 */
export const CONTINUATION_SIGNAL_PATTERNS = [
  // Fence markers
  '~~~',
  '```',
  // Structural headers
  'Key locations',
  'Remaining work',
  '## Task',
  '## Context',
  '### Continuation Prompt',
  '### Steps',
  // Narrative phrases
  'continuation prompt',
  'continued from',
  'ran out of context',
  'ready-to-paste',
  'handoff prompt',
  'resume prompt',
  'for the next session',
  // Line prefix (matched as phrase here; counting path handles prefix semantics)
  'Continuation:'
]

function escape_regex(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CONTINUATION_SIGNAL_REGEX = new RegExp(
  CONTINUATION_SIGNAL_PATTERNS.map(escape_regex).join('|'),
  'i'
)

// Same vocabulary minus the bare fence markers -- used to decide whether a
// fenced block's inner content counts as a continuation prompt. A fenced block
// that contains only the fence markers themselves should not count.
const INNER_SIGNAL_REGEX = new RegExp(
  CONTINUATION_SIGNAL_PATTERNS.filter(
    (entry) => entry !== '~~~' && entry !== '```'
  )
    .map(escape_regex)
    .join('|'),
  'i'
)

/**
 * True when text contains any continuation signal.
 * @param {string} text
 * @returns {boolean}
 */
export function has_continuation_signal(text) {
  if (typeof text !== 'string' || text.length === 0) return false
  return CONTINUATION_SIGNAL_REGEX.test(text)
}

/**
 * Count distinct continuation prompts in text.
 *
 * @param {string} text
 * @returns {number}
 */
export function count_continuation_prompts(text) {
  if (typeof text !== 'string' || text.length === 0) return 0

  let count = 0
  // Track character ranges of fenced blocks we counted so that standalone
  // `Continuation:` prefixes inside them are not double-counted.
  const counted_ranges = []

  // Match either ~~~...~~~ or ```...``` blocks. Lazy inner match; dot matches
  // newline via [\s\S].
  const fence_regex = /(~~~|```)([\s\S]*?)\1/g
  let fence_match
  while ((fence_match = fence_regex.exec(text)) !== null) {
    const inner = fence_match[2]
    if (INNER_SIGNAL_REGEX.test(inner)) {
      count++
      counted_ranges.push([fence_match.index, fence_regex.lastIndex])
    }
  }

  // Standalone `Continuation:` line prefix (case-insensitive), at line start
  // possibly after whitespace. Count only occurrences outside counted fenced
  // ranges.
  const prefix_regex = /(^|\n)[ \t]*Continuation:/gi
  let prefix_match
  while ((prefix_match = prefix_regex.exec(text)) !== null) {
    const pos = prefix_match.index + prefix_match[1].length
    const inside_fence = counted_ranges.some(
      ([start, end]) => pos >= start && pos < end
    )
    if (!inside_fence) count++
  }

  return count
}
