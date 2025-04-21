/**
 * Central file operations module for Base
 *
 * This module provides file-related operations for working with files in Git
 * repositories, primarily focused on change request and thread management.
 */

import { read_file } from './read_file.mjs'
import { list_files } from './list_files.mjs'
import { write_file } from './write_file.mjs'
import { delete_file } from './delete_file.mjs'
import { get_file_diff } from './file_diff.mjs'
import { search_files } from './search_files.mjs'
import { get_target_branch, MAIN_BRANCH_NAME } from './branch_utils.mjs'
import { batch_write_files } from './batch_write_files.mjs'

// Export all file operations
export {
  // Core operations
  read_file,
  list_files,
  write_file,
  delete_file,
  get_file_diff,
  search_files,
  batch_write_files,

  // Utility functions
  get_target_branch,
  MAIN_BRANCH_NAME
}

// Default export for convenient importing
export default {
  read_file,
  list_files,
  write_file,
  delete_file,
  get_file_diff,
  search_files,
  batch_write_files,
  get_target_branch,
  MAIN_BRANCH_NAME
}
