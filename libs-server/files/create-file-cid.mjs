/**
 * Create File Content Identifier (CID)
 *
 * Generates IPFS-compatible content identifiers using SHA-256 hash.
 * Used for file deduplication and content-addressed storage.
 */

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'

/**
 * Create content identifier for binary file content
 *
 * Uses SHA-256 hash and raw codec for IPFS compatibility.
 * The resulting CID is a base32-encoded string starting with 'bafkrei'.
 *
 * @param {Buffer|Uint8Array} file_content - Binary file content
 * @returns {Promise<string>} Content identifier string (e.g., 'bafkreia2ywz...')
 */
export async function create_file_cid(file_content) {
  const buffer = Buffer.isBuffer(file_content)
    ? file_content
    : Buffer.from(file_content)

  const hash = await sha256.digest(buffer)
  const content_id = CID.create(1, raw.code, hash)

  return content_id.toString()
}
