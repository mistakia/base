/**
 * Create a debounced callback that groups calls by a string key.
 * Subsequent calls with the same key within the delay window reset the timer.
 *
 * @param {number} delay_ms - Debounce delay in milliseconds
 * @param {Object} [options]
 * @param {Function} [options.on_error] - Error handler for async callback rejections
 * @returns {{ call: (key: string, callback: Function) => void, clear_all: () => void }}
 */
export function create_keyed_debouncer(delay_ms, { on_error } = {}) {
  const timers = new Map()

  const call = (key, callback) => {
    const existing = timers.get(key)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      timers.delete(key)
      // Catch rejected promises from async callbacks to prevent
      // unhandled rejection crashes
      try {
        const result = callback(key)
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            if (on_error) {
              on_error(error, key)
            }
          })
        }
      } catch (error) {
        if (on_error) {
          on_error(error, key)
        }
      }
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
