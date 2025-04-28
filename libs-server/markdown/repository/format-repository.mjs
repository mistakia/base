export function format_repository({ type = 'system', branch = 'main' }) {
  if (type === 'system') {
    return {
      path: './',
      branch,
      is_submodule: false,
      repo_type: 'system'
    }
  }

  if (type === 'user') {
    return {
      path: './data',
      branch,
      is_submodule: true,
      repo_type: 'user'
    }
  }
}
