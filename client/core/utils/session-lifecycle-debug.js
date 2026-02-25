/**
 * Client-side session lifecycle debug logger.
 * Enable via: localStorage.setItem('debug:session-lifecycle', '1')
 * Disable via: localStorage.removeItem('debug:session-lifecycle')
 */
export const log_lifecycle = (...args) => {
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('debug:session-lifecycle')
  ) {
    console.debug('[session-lifecycle]', ...args)
  }
}
