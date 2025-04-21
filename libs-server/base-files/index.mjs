/**
 * Central file operations module for Base
 *
 * This module provides file-related operations for working with files in Git
 * repositories, primarily focused on change request and thread management.
 */

import { read_file } from './read/index.mjs'
import { list_files } from './list/index.mjs'
import { write_file } from './write/index.mjs'
import { delete_file } from './delete/index.mjs'
import { get_file_diff } from './diff/index.mjs'
import { search_files } from './search/index.mjs'
import { get_target_branch } from './utils/branch.mjs'

// Export all file operations
export {
  // Core operations
  read_file,
  list_files,
  write_file,
  delete_file,
  get_file_diff,
  search_files,

  // Utility functions
  get_target_branch
}

// Default export for convenient importing
export default {
  read_file,
  list_files,
  write_file,
  delete_file,
  get_file_diff,
  search_files,
  get_target_branch
}
