import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { join } from 'path'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Create content identifier for binary file content
 * Uses SHA-256 hash and raw codec for IPFS compatibility
 * @param {Buffer|Uint8Array} file_content - Binary file content
 * @returns {Promise<string>} Content identifier string
 */
async function create_file_content_identifier(file_content) {
  const buffer = Buffer.isBuffer(file_content)
    ? file_content
    : Buffer.from(file_content)
  const hash = await sha256.digest(buffer)
  const content_id = CID.create(1, raw.code, hash)
  return content_id.toString()
}

/**
 * Store file content using content identifier based directory sharding
 * @param {Object} params - Parameters object
 * @param {Buffer|Uint8Array} params.file_content - Binary file content to store
 * @param {string} [params.original_filename] - Original filename for reference
 * @returns {Promise<Object>} Object containing content identifier, path, and base URI
 */
export async function store_file_with_content_identifier({
  file_content,
  original_filename
}) {
  const buffer = Buffer.isBuffer(file_content)
    ? file_content
    : Buffer.from(file_content)

  const content_identifier = await create_file_content_identifier(buffer)
  const user_base_directory = get_user_base_directory()

  const shard_level_one = content_identifier.substring(0, 2)
  const shard_level_two = content_identifier.substring(2, 4)
  const shard_directory_path = join(
    user_base_directory,
    'files',
    shard_level_one,
    shard_level_two
  )

  const absolute_file_path = join(shard_directory_path, content_identifier)
  const relative_file_path = join(
    'files',
    shard_level_one,
    shard_level_two,
    content_identifier
  )

  const file_already_exists = await file_exists_in_filesystem({
    absolute_path: absolute_file_path
  })

  if (!file_already_exists) {
    await write_file_to_filesystem({
      absolute_path: absolute_file_path,
      file_content: buffer
    })
  }

  const base_uri = `user:files/${shard_level_one}/${shard_level_two}/${content_identifier}`

  return {
    content_identifier,
    relative_path: relative_file_path,
    absolute_path: absolute_file_path,
    base_uri,
    file_size: buffer.length,
    file_already_existed: file_already_exists,
    original_filename
  }
}
