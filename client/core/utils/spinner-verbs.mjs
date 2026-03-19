// Curated spinner verbs for session activity indicators.
// Inspired by Claude Code's gerund-form loading verbs.
const SPINNER_VERBS = [
  'Thinking',
  'Pondering',
  'Reasoning',
  'Analyzing',
  'Computing',
  'Processing',
  'Deliberating',
  'Considering',
  'Evaluating',
  'Synthesizing',
  'Investigating',
  'Researching',
  'Contemplating',
  'Brainstorming',
  'Formulating',
  'Calculating',
  'Deducing',
  'Ruminating',
  'Cogitating',
  'Exploring',
  'Examining',
  'Assembling',
  'Composing',
  'Constructing',
  'Crafting',
  'Refining',
  'Iterating',
  'Compiling',
  'Orchestrating',
  'Marshalling',
  'Cooking',
  'Brewing',
  'Conjuring',
  'Weaving',
  'Sculpting',
  'Tinkering',
  'Noodling',
  'Percolating',
  'Simmering',
  'Marinating',
  'Distilling',
  'Churning',
  'Grinding',
  'Wrangling',
  'Juggling',
  'Untangling',
  'Deciphering',
  'Lollygagging',
  'Beboppin\'',
  'Vibing'
]

/**
 * Simple hash from session_id string to a numeric seed.
 */
function hash_session_id(session_id) {
  let hash = 0
  for (let i = 0; i < session_id.length; i++) {
    const char = session_id.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash)
}

/**
 * Get a deterministic spinner verb based on session_id and tick counter.
 * The session_id seeds the starting offset; tick rotates through verbs.
 * @param {string} session_id
 * @param {number} tick - counter incremented on each rotation
 * @returns {string} A spinner verb
 */
export function get_spinner_verb(session_id, tick) {
  const seed = hash_session_id(session_id || '')
  const index = (seed + tick) % SPINNER_VERBS.length
  return SPINNER_VERBS[index]
}

export { SPINNER_VERBS }
