/**
 * File writing operations for Base
 *
 * This module provides functionality for writing files to Git repositories
 * within the context of change requests.
 */

import { write_file } from './write_file.mjs'
import { batch_write_files } from './batch_write.mjs'

export { write_file, batch_write_files }

// Default export for convenient importing
export default {
  write_file,
  batch_write_files
}
