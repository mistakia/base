/**
 * Create a debounced callback that groups calls by a string key.
 * Subsequent calls with the same key within the delay window reset the timer.
 *
 * @param {number} delay_ms - Debounce delay in milliseconds
 * @returns {{ call: (key: string, callback: Function) => void, clear_all: () => void }}
 */
export function create_keyed_debouncer(delay_ms) {
  const timers = new Map()

  const call = (key, callback) => {
    const existing = timers.get(key)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      timers.delete(key)
      callback(key)
    }, delay_ms)

    timers.set(key, timer)
  }

  const clear_all = () => {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
  }

  return { call, clear_all }
}
