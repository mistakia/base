export const to_snake_slug = (value) => {
  if (!value || typeof value !== 'string') return null
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
