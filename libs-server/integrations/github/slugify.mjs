/**
 * Creates a slug from a string by converting to lowercase, replacing spaces with hyphens,
 * and removing special characters
 *
 * @param {string} text - The text to slugify
 * @returns {string} - Slugified string
 */
export function slugify(text) {
  return text
    .toString()
    .replace(/[*+~.()'"!:@]/g, '') // Remove special characters
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w-]+/g, '') // Remove all non-word characters except hyphens
    .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Trim hyphens from start
    .replace(/-+$/, '') // Trim hyphens from end
}
