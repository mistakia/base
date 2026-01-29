export const id_field_keys = new Set([
  'entity_id',
  'external_id',
  'github_api_id',
  'github_graphql_id',
  'github_project_item_id',
  'import_cid',
  'user_public_key',
  'base_uri',
  'thread_id',
  'notion_id'
])

export const link_field_keys = new Set([
  'external_url',
  'github_url',
  'permalink'
])

export const dual_field_keys = new Set(['base_uri'])

export const resolve_field_type = (key, value) => {
  if (id_field_keys.has(key)) return 'id'
  if (link_field_keys.has(key)) return 'link'

  // Heuristic: keys ending in _url or _uri
  if (key.endsWith('_url') || key.endsWith('_uri')) return 'link'

  if (typeof value === 'boolean') return 'boolean'

  if (Array.isArray(value)) {
    if (value.length === 0) return 'primitive_array'
    if (typeof value[0] === 'object' && value[0] !== null) return 'object_array'
    return 'primitive_array'
  }

  if (typeof value === 'object' && value !== null) return 'object'

  // Heuristic: string values containing :// are links
  if (typeof value === 'string' && value.includes('://')) return 'link'

  return 'default'
}
