import { expect } from 'chai'

// Note: Full hook testing requires React testing utilities which are not currently installed.
// This test file focuses on the pure helper functions that can be tested without React.
//
// The functions are re-implemented here because client code uses webpack aliases
// (@core, @components) that aren't available in Node.js test environment.
// The implementations must match use-prompt-history.js

const STORAGE_KEY = 'thread_input_prompt_history'
const MAX_ENTRIES = 200

// Mock localStorage for test isolation
function create_mock_storage() {
  const store = new Map()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (index) => [...store.keys()][index] ?? null
  }
}

let mock_storage

// Re-implemented pure functions matching use-prompt-history.js
function load_history() {
  try {
    const stored = mock_storage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save_history(entries) {
  try {
    mock_storage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Silently fail
  }
}

function record_prompt(text) {
  if (!text || !text.trim()) return

  const entries = load_history()

  // Deduplicate consecutive: skip if identical to most recent
  if (entries.length > 0 && entries[0].text === text) return

  const entry = { text, timestamp: Date.now() }
  const updated = [entry, ...entries].slice(0, MAX_ENTRIES)
  save_history(updated)
}

function clear_history_storage() {
  try {
    mock_storage.removeItem(STORAGE_KEY)
  } catch {
    // Silently fail
  }
}

function get_filtered_entries(filter_text) {
  const entries = load_history()
  if (!filter_text) return entries

  const lower_filter = filter_text.toLowerCase()
  return entries.filter((entry) =>
    entry.text.toLowerCase().includes(lower_filter)
  )
}

function format_relative_time(timestamp) {
  const diff_ms = Date.now() - timestamp
  const diff_seconds = Math.floor(diff_ms / 1000)
  const diff_minutes = Math.floor(diff_seconds / 60)
  const diff_hours = Math.floor(diff_minutes / 60)
  const diff_days = Math.floor(diff_hours / 24)

  if (diff_seconds < 60) return 'now'
  if (diff_minutes < 60) return `${diff_minutes}m ago`
  if (diff_hours < 24) return `${diff_hours}h ago`
  if (diff_days === 1) return 'yesterday'
  return `${diff_days}d ago`
}

// Inline navigation state (simulates useRef behavior for testing)
function create_navigation_state() {
  let history_index = -1
  let saved_draft = ''

  return {
    get is_navigating() {
      return history_index > -1
    },

    navigate_back(current_text) {
      const entries = load_history()
      if (entries.length === 0) return null

      if (history_index === -1) {
        saved_draft = current_text
      }

      const next_index = history_index + 1
      if (next_index >= entries.length) return null

      history_index = next_index
      return entries[next_index].text
    },

    navigate_forward() {
      if (history_index <= -1) return null

      const next_index = history_index - 1
      history_index = next_index

      if (next_index === -1) {
        return saved_draft
      }

      const entries = load_history()
      return entries[next_index]?.text ?? null
    },

    reset() {
      history_index = -1
      saved_draft = ''
    }
  }
}

describe('use_prompt_history - pure functions', () => {
  beforeEach(() => {
    mock_storage = create_mock_storage()
  })

  describe('record_prompt', () => {
    it('should add an entry to empty history', () => {
      record_prompt('hello world')
      const entries = load_history()
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].text).to.equal('hello world')
      expect(entries[0].timestamp).to.be.a('number')
    })

    it('should prepend new entries (newest first)', () => {
      record_prompt('first')
      record_prompt('second')
      const entries = load_history()
      expect(entries).to.have.lengthOf(2)
      expect(entries[0].text).to.equal('second')
      expect(entries[1].text).to.equal('first')
    })

    it('should deduplicate consecutive identical prompts', () => {
      record_prompt('same text')
      record_prompt('same text')
      const entries = load_history()
      expect(entries).to.have.lengthOf(1)
    })

    it('should allow non-consecutive duplicate prompts', () => {
      record_prompt('first')
      record_prompt('second')
      record_prompt('first')
      const entries = load_history()
      expect(entries).to.have.lengthOf(3)
      expect(entries[0].text).to.equal('first')
      expect(entries[1].text).to.equal('second')
      expect(entries[2].text).to.equal('first')
    })

    it('should cap at 200 entries', () => {
      for (let i = 0; i < 210; i++) {
        record_prompt(`prompt ${i}`)
      }
      const entries = load_history()
      expect(entries).to.have.lengthOf(MAX_ENTRIES)
      expect(entries[0].text).to.equal('prompt 209')
    })

    it('should not record empty prompts', () => {
      record_prompt('')
      record_prompt(null)
      record_prompt(undefined)
      const entries = load_history()
      expect(entries).to.have.lengthOf(0)
    })

    it('should not record whitespace-only prompts', () => {
      record_prompt('   ')
      record_prompt('\n\t')
      const entries = load_history()
      expect(entries).to.have.lengthOf(0)
    })
  })

  describe('clear_history_storage', () => {
    it('should remove all history entries', () => {
      record_prompt('first')
      record_prompt('second')
      expect(load_history()).to.have.lengthOf(2)

      clear_history_storage()
      expect(load_history()).to.have.lengthOf(0)
    })

    it('should handle clearing empty history', () => {
      clear_history_storage()
      expect(load_history()).to.have.lengthOf(0)
    })
  })

  describe('get_filtered_entries', () => {
    beforeEach(() => {
      record_prompt('fix the CSS layout issue')
      record_prompt('add unit tests for auth')
      record_prompt('implement the login page')
    })

    it('should return all entries when filter is empty', () => {
      const entries = get_filtered_entries('')
      expect(entries).to.have.lengthOf(3)
    })

    it('should return all entries when filter is null', () => {
      const entries = get_filtered_entries(null)
      expect(entries).to.have.lengthOf(3)
    })

    it('should filter by substring match', () => {
      const entries = get_filtered_entries('auth')
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].text).to.equal('add unit tests for auth')
    })

    it('should be case-insensitive', () => {
      const entries = get_filtered_entries('CSS')
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].text).to.equal('fix the CSS layout issue')
    })

    it('should return empty array when no matches', () => {
      const entries = get_filtered_entries('nonexistent')
      expect(entries).to.have.lengthOf(0)
    })

    it('should match partial words', () => {
      const entries = get_filtered_entries('impl')
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].text).to.equal('implement the login page')
    })
  })

  describe('format_relative_time', () => {
    it('should return "now" for timestamps within the last minute', () => {
      const result = format_relative_time(Date.now() - 30000)
      expect(result).to.equal('now')
    })

    it('should return minutes ago for recent timestamps', () => {
      const result = format_relative_time(Date.now() - 5 * 60 * 1000)
      expect(result).to.equal('5m ago')
    })

    it('should return hours ago for timestamps today', () => {
      const result = format_relative_time(Date.now() - 3 * 60 * 60 * 1000)
      expect(result).to.equal('3h ago')
    })

    it('should return "yesterday" for 1 day old timestamps', () => {
      const result = format_relative_time(Date.now() - 24 * 60 * 60 * 1000)
      expect(result).to.equal('yesterday')
    })

    it('should return days ago for older timestamps', () => {
      const result = format_relative_time(Date.now() - 5 * 24 * 60 * 60 * 1000)
      expect(result).to.equal('5d ago')
    })
  })

  describe('load_history', () => {
    it('should return empty array when no history exists', () => {
      const entries = load_history()
      expect(entries).to.deep.equal([])
    })

    it('should return empty array for invalid JSON', () => {
      mock_storage.setItem(STORAGE_KEY, 'not valid json')
      const entries = load_history()
      expect(entries).to.deep.equal([])
    })

    it('should return empty array for non-array JSON', () => {
      mock_storage.setItem(STORAGE_KEY, '{"not": "array"}')
      const entries = load_history()
      expect(entries).to.deep.equal([])
    })
  })

  describe('navigation state', () => {
    let nav

    beforeEach(() => {
      nav = create_navigation_state()
      record_prompt('first')
      record_prompt('second')
      record_prompt('third')
    })

    it('should start in non-navigating state', () => {
      expect(nav.is_navigating).to.be.false
    })

    it('should navigate back through history', () => {
      const text = nav.navigate_back('current draft')
      expect(text).to.equal('third')
      expect(nav.is_navigating).to.be.true
    })

    it('should save draft when starting navigation', () => {
      nav.navigate_back('my draft')
      nav.navigate_back('my draft')
      nav.navigate_back('my draft')

      // Navigate back to draft position
      nav.navigate_forward()
      nav.navigate_forward()
      const restored = nav.navigate_forward()
      expect(restored).to.equal('my draft')
    })

    it('should navigate forward through history', () => {
      nav.navigate_back('draft')
      nav.navigate_back('draft')
      const text = nav.navigate_forward()
      expect(text).to.equal('third')
    })

    it('should return null when at the end of history', () => {
      nav.navigate_back('draft')
      nav.navigate_back('draft')
      nav.navigate_back('draft')
      const text = nav.navigate_back('draft')
      expect(text).to.be.null
    })

    it('should return saved draft when navigating past newest entry', () => {
      nav.navigate_back('my draft text')
      const text = nav.navigate_forward()
      expect(text).to.equal('my draft text')
      expect(nav.is_navigating).to.be.false
    })

    it('should return null when navigate_forward called without navigating', () => {
      const text = nav.navigate_forward()
      expect(text).to.be.null
    })

    it('should return null when navigate_back called with empty history', () => {
      clear_history_storage()
      const text = nav.navigate_back('draft')
      expect(text).to.be.null
    })

    it('should reset navigation state', () => {
      nav.navigate_back('draft')
      expect(nav.is_navigating).to.be.true

      nav.reset()
      expect(nav.is_navigating).to.be.false
    })

    it('should cycle through all entries and back', () => {
      // Navigate back through all 3 entries
      expect(nav.navigate_back('draft')).to.equal('third')
      expect(nav.navigate_back('draft')).to.equal('second')
      expect(nav.navigate_back('draft')).to.equal('first')
      expect(nav.navigate_back('draft')).to.be.null

      // Navigate forward through all entries back to draft
      expect(nav.navigate_forward()).to.equal('second')
      expect(nav.navigate_forward()).to.equal('third')
      expect(nav.navigate_forward()).to.equal('draft')
      expect(nav.is_navigating).to.be.false
    })
  })
})
