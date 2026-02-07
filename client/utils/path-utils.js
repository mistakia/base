/**
 * Get the shared path prefix from an array of file paths
 * @param {string[]} paths - Array of file paths
 * @returns {string} Shared prefix with trailing slash, or empty string
 */
export const get_shared_prefix = (paths) => {
  if (!paths || paths.length === 0) return ''
  const split_paths = paths.map((p) => p.split('/'))
  const shortest_len = Math.min(...split_paths.map((parts) => parts.length))
  const shared_parts = []
  for (let i = 0; i < shortest_len; i++) {
    const part = split_paths[0][i]
    if (split_paths.every((arr) => arr[i] === part)) {
      shared_parts.push(part)
    } else {
      break
    }
  }
  const prefix = shared_parts.join('/')
  return prefix.length > 0 ? `${prefix}/` : ''
}
