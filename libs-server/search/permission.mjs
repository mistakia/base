/**
 * Search Permission Filter
 *
 * Deny-by-default wrapper around check_permissions_batch. Operates on the
 * orchestrator's paginated top-`limit` so the permission gate is bounded.
 *
 * Rules:
 *   - Hit missing entity_uri            -> dropped (programming error upstream)
 *   - Hit whose entity_uri fails to     -> dropped (can't be resolved = deny)
 *     resolve to an absolute filesystem
 *   - Permission result missing         -> dropped (deny-by-default)
 *   - Permission result with            -> kept
 *     read.allowed === true
 *   - Anything else                     -> dropped
 */

import debug from 'debug'

import { check_permissions_batch } from '#server/middleware/permission/permission-service.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('search:permission')

/**
 * @param {Object} params
 * @param {Array<Object>} params.hits - Ranked + paginated hits
 * @param {string|null} params.user_public_key
 * @returns {Promise<Array<Object>>}
 */
export async function permission_filter({ hits, user_public_key }) {
  if (!hits || hits.length === 0) return []

  const resolved = []
  for (const hit of hits) {
    if (!hit.entity_uri) {
      log('Dropping hit without entity_uri')
      continue
    }
    let absolute_path
    try {
      absolute_path = resolve_base_uri(hit.entity_uri)
    } catch (error) {
      log(
        'Dropping hit with unresolvable entity_uri %s: %s',
        hit.entity_uri,
        error.message
      )
      continue
    }
    resolved.push({ hit, absolute_path })
  }

  if (resolved.length === 0) return []

  const results_by_path = await check_permissions_batch({
    user_public_key: user_public_key || null,
    resource_paths: resolved.map((r) => r.absolute_path)
  })

  const permitted = []
  for (const { hit, absolute_path } of resolved) {
    const permission = results_by_path[absolute_path]
    if (!permission || permission.read?.allowed !== true) continue
    permitted.push(hit)
  }

  return permitted
}

export default { permission_filter }
