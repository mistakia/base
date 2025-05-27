import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as json from 'multiformats/codecs/json'

/**
 * Create a CID (Content Identifier) for data object
 * Uses SHA-256 hash and JSON codec
 *
 * @param {Object} data_object - Data to create CID for
 * @returns {string} CID string
 */
export async function create_content_identifier(data_object) {
  const bytes = json.encode(data_object)
  const hash = await sha256.digest(bytes)
  const content_id = CID.create(1, json.code, hash)
  return content_id.toString()
}
