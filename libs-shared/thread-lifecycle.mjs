// Canonical thread lifecycle SSOT. Imported by both web and iOS clients (via mirror).
// Status set, labels, colors, glyphs, spinner-applicability, and the active verb pool
// all live here.

export const LIFECYCLE_STATUSES = Object.freeze([
  'queued',
  'starting',
  'active',
  'idle',
  'completed',
  'failed'
])

export const LIVE_STATUSES = Object.freeze(['queued', 'starting', 'active', 'idle'])
export const TERMINAL_STATUSES = Object.freeze(['completed', 'failed'])

export const STATUS_LABEL = Object.freeze({
  queued: 'Queued',
  starting: 'Starting',
  active: 'Active',
  idle: 'Awaiting input',
  completed: 'Completed',
  failed: 'Failed'
})

export const STATUS_GLYPH = Object.freeze({
  queued: '\u2022',
  starting: '\u2022',
  active: '\u2022',
  idle: '\u2022',
  completed: '\u2713',
  failed: '\u2715'
})

export const STATUS_COLOR_TOKEN = Object.freeze({
  queued: 'info',
  starting: 'info',
  active: 'success',
  idle: 'warning',
  completed: 'text_secondary',
  failed: 'error'
})

export const STATUS_SHOWS_SPINNER = Object.freeze({
  queued: false,
  starting: false,
  active: true,
  idle: false,
  completed: false,
  failed: false
})

export const ACTIVE_VERBS = Object.freeze([
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
  "Beboppin'",
  'Vibing'
])

// djb2 hash. Both clients must implement this exact algorithm so a given
// (thread_id, turn_count) yields the same verb on web and iOS.
// IMPORTANT: assumes ASCII-only `thread_id` (UUIDs in this codebase). JS
// iterates UTF-16 code units (`charCodeAt`); Swift iterates Unicode scalars.
// For ASCII inputs the two are equivalent; for non-BMP characters they would
// diverge silently. Do not feed non-ASCII strings into this function.
// Fixture inputs for cross-client equality check (compute and compare to Swift):
//   'abc'
//   '00000000-0000-0000-0000-000000000000'
export function djb2_hash(input) {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

export function pick_active_verb({ thread_id, turn_count }) {
  const seed = djb2_hash(thread_id || '')
  const index = (seed + (turn_count || 0)) % ACTIVE_VERBS.length
  return ACTIVE_VERBS[index]
}

export const BRAILLE_SPINNER_FRAMES = Object.freeze([
  '\u280B',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283C',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280F'
])

export const BRAILLE_SPINNER_FRAME_INTERVAL_MS = 120
