/**
 * Format external ID by joining external system and item ID
 * @param {object} params - Parameters
 * @param {string} params.external_system - External system identifier
 * @param {string} params.external_item_id - External item identifier
 * @returns {string} Formatted external ID
 */
export function format_external_id({ external_system, external_item_id }) {
  return `${external_system}:${external_item_id}`
}
