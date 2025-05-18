import debug from 'debug'
import fs from 'fs/promises'

const log = debug('filesystem:delete-file')

export const delete_file_in_filesystem = async ({ file_path }) => {
  try {
    log(`Attempting to delete file: ${file_path}`)

    // Check if file exists first
    try {
      await fs.access(file_path)
    } catch (error) {
      return {
        success: false,
        error: `File does not exist: ${file_path}`
      }
    }

    // Delete the file
    await fs.unlink(file_path)

    log(`Successfully deleted file: ${file_path}`)
    return {
      success: true,
      message: `File deleted successfully: ${file_path}`
    }
  } catch (error) {
    log(`Error deleting file ${file_path}:`, error)
    return {
      success: false,
      error: `Failed to delete file: ${error.message}`
    }
  }
}
