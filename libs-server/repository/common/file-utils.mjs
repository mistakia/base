/**
 * Creates a file info object with common properties
 * @param {Object} params - Parameters
 * @param {string} params.repo_type - The repository type
 * @param {string} params.repo_path - The repository path
 * @param {string} params.relative_path - The relative path within the repository
 * @param {string} params.absolute_path - The absolute path of the file
 * @param {string} params.source - The source of the file ('git' or 'filesystem')
 * @param {string} params.submodule_base_path - The base path of the submodule
 * @returns {Object} File info object
 */
export function create_file_info({
  repo_type,
  repo_path,
  relative_path,
  absolute_path,
  source,
  submodule_base_path,
  ...extra_props
}) {
  // Calculate base_relative_path based on whether it's a submodule file
  const base_relative_path = submodule_base_path
    ? `${submodule_base_path}/${relative_path}`
    : relative_path

  return {
    repo_type,
    repo_path,
    git_relative_path: relative_path,
    absolute_path,
    source,
    base_relative_path,
    ...extra_props
  }
}
