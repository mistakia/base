export const CLASSIFICATION_COLUMNS = [
  { name: 'domain_tags', type: 'VARCHAR' },
  { name: 'classification_confidence', type: 'DOUBLE' },
  { name: 'classification_model', type: 'VARCHAR' },
  { name: 'classified_at', type: 'TIMESTAMP' },
  { name: 'github_links', type: 'VARCHAR' },
  { name: 'blog_links', type: 'VARCHAR' },
  { name: 'external_links', type: 'VARCHAR' }
]

/**
 * Ensure classification columns exist on a table.
 * Uses ALTER TABLE ADD COLUMN IF NOT EXISTS.
 *
 * @param {object} adapter - Storage adapter with execute()
 * @param {string} table_name - Target table name
 */
export async function ensure_classification_columns(adapter, table_name) {
  for (const col of CLASSIFICATION_COLUMNS) {
    try {
      await adapter.execute({
        query: `ALTER TABLE ${table_name} ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`
      })
    } catch {
      // Column may already exist
    }
  }
}

/**
 * Load items from a table, optionally filtering to unclassified only.
 *
 * @param {object} adapter - Storage adapter with query()
 * @param {boolean} reclassify - If true, return all items; otherwise only unclassified
 * @returns {Promise<object[]>} Array of item rows
 */
export async function load_unclassified_items(adapter, reclassify) {
  const all_items = await adapter.query({ limit: 100000 })

  if (reclassify) {
    return all_items
  }

  return all_items.filter((item) => !item.classified_at)
}
