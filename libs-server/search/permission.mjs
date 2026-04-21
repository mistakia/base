// Deny-by-default wrapper around check_permissions_batch over paginated hits.
// Each hit must carry an entity_uri; hits whose entity_uri cannot be resolved
// to a filesystem path are dropped.

import debug from 'debug'

import { check_permissions_batch } from '#server/middleware/permission/permission-service.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('search:permission')

export async function permission_filter({ hits, user_public_key }) {
  if (!hits || hits.length === 0) return []

  const resolvable = []
  for (const hit of hits) {
    if (!hit.entity_uri) {
      log('Dropping hit without entity_uri')
      continue
    }
    try {
      resolve_base_uri(hit.entity_uri)
    } catch (error) {
      log(
        'Dropping hit with unresolvable entity_uri %s: %s',
        hit.entity_uri,
        error.message
      )
      continue
    }
    resolvable.push(hit)
  }

  if (resolvable.length === 0) return []

  const results_by_uri = await check_permissions_batch({
    user_public_key: user_public_key || null,
    resource_paths: resolvable.map((h) => h.entity_uri)
  })

  const permitted = []
  for (const hit of resolvable) {
    const permission = results_by_uri[hit.entity_uri]
    if (!permission || permission.read?.allowed !== true) continue
    permitted.push(hit)
  }

  return permitted
}
