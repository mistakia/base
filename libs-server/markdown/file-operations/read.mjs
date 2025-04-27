import debug from 'debug'
import fs from 'fs/promises'

import { read_file_from_ref } from '#libs-server/git/file-operations.mjs'

const log = debug('markdown:file-operations:read')

/**
 * Reads markdown file content directly from disk
 * @param {Object} params
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} [params.encoding='utf8'] File encoding
 * @returns {Promise<string>} File content as string
 */
export async function read_markdown_from_file({
  absolute_path,
  encoding = 'utf8'
}) {
  log(`Reading from disk: ${absolute_path}`)

  try {
    const file_content = await fs.readFile(absolute_path, encoding)
    return file_content
  } catch (error) {
    log(`Error reading file ${absolute_path}:`, error)
    throw new Error(`Failed to read file: ${absolute_path}`)
  }
}

/**
 * Reads markdown file content from git repository
 * @param {Object} params
 * @param {string} params.git_relative_path Git relative path to the file
 * @param {string} params.branch Branch reference for git
 * @param {string} params.repo_path Repository path
 * @returns {Promise<string>} File content as string
 */
export async function read_markdown_from_git({
  git_relative_path,
  branch,
  repo_path
}) {
  log(`Reading from git: ${git_relative_path} at branch ${branch}`)

  try {
    const file_content = await read_file_from_ref({
      repo_path,
      ref: branch,
      file_path: git_relative_path
    })

    return file_content
  } catch (error) {
    log(`Error reading from git ${git_relative_path} at ${branch}:`, error)
    throw new Error(
      `Failed to read file from git: ${git_relative_path} at ${branch}`
    )
  }
}
