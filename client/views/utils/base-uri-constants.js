// Base URI path mappings for client-side link handling
export const BASE_URI_PATHS = {
  'user:': '/',
  'sys:': '/repository/active/base'
}

// Regex patterns for detecting base URI references
export const BASE_URI_PATTERNS = {
  // Matches [[user:path/to/file.md]] or [[sys:path/to/file.md]]
  WIKI_LINK: /\[\[([a-z]+):([^\]]+)\]\]/g,

  // Matches [text](user:path/to/file.md) or [text](sys:path/to/file.md)
  MARKDOWN_LINK: /\[([^\]]*)\]\(([a-z]+):([^)]+)\)/g
}

// Check if a URL is absolute
export const is_absolute_url = (url) => {
  try {
    URL(url)
    return true
  } catch {
    return false
  }
}

// Convert base URI to client path
export const convert_base_uri_to_path = (base_uri) => {
  const colon_index = base_uri.indexOf(':')
  if (colon_index === -1) return base_uri

  const scheme = base_uri.substring(0, colon_index + 1)
  const path = base_uri.substring(colon_index + 1)

  const base_path = BASE_URI_PATHS[scheme]
  if (!base_path) return base_uri

  return base_path + (base_path.endsWith('/') ? '' : '/') + path
}

// Get current window path for relative link resolution
export const get_current_window_path = () => {
  return window.location.pathname
}

// Resolve relative path against current window path
export const resolve_relative_path = (
  relative_path,
  current_path = get_current_window_path()
) => {
  // If it starts with /, it's already absolute relative to root
  if (relative_path.startsWith('/')) {
    return relative_path
  }

  // Determine the base directory for resolution
  // If current_path doesn't end with a file extension, treat it as a directory
  // If it ends with a file extension, get its parent directory
  let base_directory
  if (/\.[a-zA-Z0-9]+$/.test(current_path)) {
    // Has file extension, get parent directory
    base_directory = current_path.substring(0, current_path.lastIndexOf('/'))
  } else {
    // No file extension, treat as directory
    base_directory = current_path
  }

  // Handle ./relative/path
  if (relative_path.startsWith('./')) {
    return base_directory + '/' + relative_path.substring(2)
  }

  // Handle ../relative/path
  if (relative_path.startsWith('../')) {
    let working_directory = base_directory
    let remaining_path = relative_path

    while (remaining_path.startsWith('../')) {
      working_directory = working_directory.substring(
        0,
        working_directory.lastIndexOf('/')
      )
      remaining_path = remaining_path.substring(3)
    }

    return working_directory + '/' + remaining_path
  }

  // Otherwise, resolve relative to current directory
  return base_directory + '/' + relative_path
}
