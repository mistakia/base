/**
 * Formats a public key to show first 8 and last 8 characters
 * @param {string} public_key - The full public key string
 * @returns {string} Formatted public key (e.g., "12345678...87654321")
 */
export const format_public_key = (public_key) => {
  if (!public_key || public_key.length < 16) {
    return public_key || ''
  }

  const first_eight = public_key.slice(0, 8)
  const last_eight = public_key.slice(-8)

  return `${first_eight}...${last_eight}`
}
