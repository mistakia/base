import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'

/**
 * Creates a file info object with common properties
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - The repository path
 * @param {string} params.relative_path - The relative path within the repository
 * @param {string} params.absolute_path - The absolute path of the file
 * @returns {Object} File info object
 */
export function create_file_info({
  repo_path,
  relative_path,
  absolute_path,
  ...extra_props
}) {
  // Calculate base_uri using the proper URI format based on the absolute path
  const base_uri = create_base_uri_from_path(absolute_path)

  return {
    repo_path,
    git_relative_path: relative_path,
    absolute_path,
    base_uri,
    ...extra_props
  }
}
