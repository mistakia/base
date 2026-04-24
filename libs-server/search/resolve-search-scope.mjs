// Resolve a search scope URI (e.g. 'user:', 'user:task/foo/') to the
// absolute filesystem path that the path source should enumerate.
//
// Search scope is distinct from thread working_directory. It is a
// per-request filter, not a session cwd. Existence is not required —
// a missing directory just yields zero results downstream.
//
// Input type: base URI. Raw filesystem paths are not accepted.

import path from 'path'

import {
  is_valid_base_uri,
  resolve_base_uri
} from '#libs-server/base-uri/index.mjs'
import { is_path_within_directory } from '#libs-server/utils/is-path-within-directory.mjs'
import config from '#config'

export function resolve_search_scope({ scope_uri, user_base_directory } = {}) {
  if (!scope_uri) {
    return { resolved_path: null }
  }

  if (typeof scope_uri !== 'string' || !is_valid_base_uri(scope_uri)) {
    throw new Error(
      `scope must be a base URI (e.g. 'user:', 'user:task/'); got: ${scope_uri}`
    )
  }

  const effective_user_base =
    user_base_directory ||
    config.user_base_directory ||
    process.env.USER_BASE_DIRECTORY

  const resolved_path = resolve_base_uri(scope_uri, {
    user_base_directory: effective_user_base
  })

  if (effective_user_base) {
    const base_resolved = path.resolve(effective_user_base)
    if (!is_path_within_directory(resolved_path, base_resolved)) {
      throw new Error(
        `Scope resolves outside user_base_directory: ${scope_uri}`
      )
    }
  }

  return { resolved_path }
}

export default { resolve_search_scope }
