// Deny-by-default wrapper around check_permissions_batch over paginated hits.
// Each hit must carry an entity_uri; hits whose entity_uri cannot be resolved
// to a filesystem path are dropped.

import debug from 'debug'

import { check_permissions_batch } from '#server/middleware/permission/permission-service.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('search:permission')

const ENTITY_SCHEME = /^(?:user|sys):/

export async function permission_filter({ hits, user_public_key }) {
  if (!hits || hits.length === 0) return []

  // Hits from external search sources carry synthetic URIs (e.g.
  // `discord://message/<id>`) that are not backed by filesystem entities.
  // The base entity-permission model does not govern them -- the source
  // adapter (registered via user-base `extension/*/search-source.mjs`) is
  // responsible for its own audience enforcement. Pass them through here.
  // Preserve input order so caller-ranked results remain ranked.
  const entity_uris_to_check = []
  for (const hit of hits) {
    if (!hit.entity_uri) continue
    if (!ENTITY_SCHEME.test(hit.entity_uri)) continue
    try {
      resolve_base_uri(hit.entity_uri)
    } catch (error) {
      log(
        'Unresolvable entity_uri %s: %s',
        hit.entity_uri,
        error.message
      )
      continue
    }
    entity_uris_to_check.push(hit.entity_uri)
  }

  const results_by_uri = entity_uris_to_check.length === 0
    ? {}
    : await check_permissions_batch({
        user_public_key: user_public_key || null,
        resource_paths: entity_uris_to_check
      })

  const permitted = []
  for (const hit of hits) {
    if (!hit.entity_uri) {
      log('Dropping hit without entity_uri')
      continue
    }
    if (!ENTITY_SCHEME.test(hit.entity_uri)) {
      permitted.push(hit)
      continue
    }
    const permission = results_by_uri[hit.entity_uri]
    if (!permission || permission.read?.allowed !== true) continue
    permitted.push(hit)
  }

  return permitted
}
