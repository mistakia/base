/**
 * Store File
 *
 * Stores a file at a caller-specified path with CID-based deduplication.
 * Files are indexed in the files database for tracking and queries.
 */

import { promises as fs } from 'fs'
import { join, dirname, basename, extname, normalize, isAbsolute } from 'path'
import debug from 'debug'

import { create_file_cid } from './create-file-cid.mjs'
import { insert_file_record, get_file_by_cid } from './file-index.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { ensure_directory } from '#libs-server/filesystem/ensure-directory.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('files:store')

/**
 * Store a file at the specified path
 *
 * @param {Object} params - Parameters object
 * @param {Buffer|Uint8Array} params.file_content - Binary file content to store
 * @param {string} params.target_path - Storage path relative to user-base (caller determines)
 * @param {string} [params.original_name] - Original filename for reference
 * @param {string} [params.mime_type] - MIME type of the file
 * @param {string} [params.source_uri] - Where the file came from (URL, integration, etc.)
 * @param {string} [params.context] - Storage context (music, import, etc.)
 * @param {Object} [params.custom_hash] - Optional domain-specific hash
 * @param {string} [params.custom_hash.type] - Type of custom hash (e.g., 'audio-only-sha256')
 * @param {string} [params.custom_hash.value] - Pre-computed custom hash value
 * @param {boolean} [params.skip_index=false] - Skip database indexing (for testing)
 * @returns {Promise<Object>} Result object with cid, path, absolute_path, base_uri, size, etc.
 */
export async function store_file({
  file_content,
  target_path,
  original_name,
  mime_type,
  source_uri,
  context,
  custom_hash,
  skip_index = false
}) {
  const buffer = Buffer.isBuffer(file_content)
    ? file_content
    : Buffer.from(file_content)

  const user_base_directory = get_user_base_directory()

  // Validate target_path to prevent path traversal attacks
  const normalized_path = normalize(target_path)
  if (isAbsolute(normalized_path) || normalized_path.startsWith('..')) {
    throw new Error(
      'Invalid target path: must be relative without path traversal'
    )
  }

  log('Storing file: %s (%d bytes)', normalized_path, buffer.length)

  // Compute CID for deduplication
  const cid = await create_file_cid(buffer)
  log('Computed CID: %s', cid)

  // Check if file with same CID already exists in index
  if (!skip_index) {
    const existing_record = await get_file_by_cid(cid)
    if (existing_record) {
      log('File already exists at: %s', existing_record.path)
      return {
        cid,
        path: existing_record.path,
        absolute_path: join(user_base_directory, existing_record.path),
        base_uri: `user:${existing_record.path}`,
        size: buffer.length,
        custom_hash: existing_record.custom_hash
          ? {
              type: existing_record.hash_type,
              value: existing_record.custom_hash
            }
          : null,
        already_existed: true
      }
    }
  }

  // Resolve target path with collision handling and CID-based deduplication
  const { path: resolved_path, existing_match } = await resolve_target_path({
    user_base_directory,
    target_path: normalized_path,
    cid
  })

  const absolute_path = join(user_base_directory, resolved_path)

  // Only write file if it doesn't already exist with matching CID
  if (!existing_match) {
    await ensure_directory(dirname(absolute_path))
    await fs.writeFile(absolute_path, buffer)
    log('File written to: %s', absolute_path)
  } else {
    log('File already exists with matching CID: %s', absolute_path)
  }

  // Index in database
  if (!skip_index) {
    await insert_file_record({
      cid,
      path: resolved_path,
      original_name: original_name || basename(resolved_path),
      mime_type,
      size: buffer.length,
      created_at: new Date(),
      source_uri,
      custom_hash: custom_hash?.value || null,
      hash_type: custom_hash?.type || null,
      context
    })
    log('File indexed in database')
  }

  const base_uri = `user:${resolved_path}`

  return {
    cid,
    path: resolved_path,
    absolute_path,
    base_uri,
    size: buffer.length,
    custom_hash: custom_hash || null,
    already_existed: existing_match
  }
}

/**
 * Resolve target path with collision handling and CID-based deduplication
 *
 * If a file already exists at the target path:
 * - If it has the same CID, return it (idempotent - no duplicate created)
 * - If it has a different CID, append -1, -2, etc. before extension
 *
 * @param {Object} params - Parameters
 * @param {string} params.user_base_directory - User base directory path
 * @param {string} params.target_path - Requested target path
 * @param {string} params.cid - CID of the content being stored
 * @returns {Promise<{path: string, existing_match: boolean}>} Resolved path and whether it matched existing
 */
async function resolve_target_path({ user_base_directory, target_path, cid }) {
  const absolute_path = join(user_base_directory, target_path)

  // Check if file exists at target path
  const exists = await file_exists_in_filesystem({ absolute_path })

  if (!exists) {
    return { path: target_path, existing_match: false }
  }

  // File exists - check if it has the same CID (idempotent case)
  try {
    const existing_content = await fs.readFile(absolute_path)
    const existing_cid = await create_file_cid(existing_content)

    if (existing_cid === cid) {
      log('Existing file at %s has matching CID, reusing', target_path)
      return { path: target_path, existing_match: true }
    }
  } catch (err) {
    log('Could not read existing file for CID check: %s', err.message)
  }

  // File exists with different CID, need to add suffix
  const dir = dirname(target_path)
  const ext = extname(target_path)
  const base = basename(target_path, ext)

  let counter = 1
  let new_path = join(dir, `${base}-${counter}${ext}`)

  while (
    await file_exists_in_filesystem({
      absolute_path: join(user_base_directory, new_path)
    })
  ) {
    // Also check if this suffixed file has matching CID
    try {
      const suffixed_content = await fs.readFile(
        join(user_base_directory, new_path)
      )
      const suffixed_cid = await create_file_cid(suffixed_content)

      if (suffixed_cid === cid) {
        log('Existing file at %s has matching CID, reusing', new_path)
        return { path: new_path, existing_match: true }
      }
    } catch (err) {
      // Ignore read errors, continue checking
    }

    counter++
    new_path = join(dir, `${base}-${counter}${ext}`)

    // Safety limit to prevent infinite loops
    if (counter > 1000) {
      throw new Error(`Too many filename collisions for: ${target_path}`)
    }
  }

  log('Resolved collision: %s -> %s', target_path, new_path)
  return { path: new_path, existing_match: false }
}
