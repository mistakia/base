/**
 * Files Module
 *
 * Provides file storage utilities and index operations.
 */

// Main storage function
export { store_file } from './store-file.mjs'

// CID computation
export { create_file_cid } from './create-file-cid.mjs'

// Database index operations
export {
  insert_file_record,
  file_exists_by_cid,
  get_file_by_cid,
  query_files,
  find_files_by_custom_hash,
  find_files_by_context,
  count_files,
  delete_file_record,
  close_files_adapter
} from './file-index.mjs'
