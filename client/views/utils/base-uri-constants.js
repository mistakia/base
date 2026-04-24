// Base URI path mappings for client-side link handling
export const BASE_URI_PATHS = {
  'user:': '/',
  'sys:': '/repository/active/base'
}

// Base filesystem directories (injected at build time via webpack DefinePlugin)
// These values MUST be provided via webpack DefinePlugin - no hardcoded fallbacks

/* global USER_BASE_DIRECTORY, SYSTEM_BASE_DIRECTORY */
if (typeof USER_BASE_DIRECTORY === 'undefined') {
  throw new Error(
    'USER_BASE_DIRECTORY is not defined. This must be injected via webpack DefinePlugin.'
  )
}
if (typeof SYSTEM_BASE_DIRECTORY === 'undefined') {
  throw new Error(
    'SYSTEM_BASE_DIRECTORY is not defined. This must be injected via webpack DefinePlugin.'
  )
}

export const BASE_DIRECTORIES = {
  user: USER_BASE_DIRECTORY,
  system: SYSTEM_BASE_DIRECTORY
}

// Regex patterns for detecting base URI references
export const BASE_URI_PATTERNS = {
  // Matches [[user:path/to/file.md]] or [[sys:path/to/file.md|Display Text]]
  WIKI_LINK: /\[\[(sys|user):([^\]|]+)(?:\|([^\]]*))?\]\]/g,

  // Matches [text](user:path/to/file.md) or [text](sys:path/to/file.md)
  MARKDOWN_LINK: /\[([^\]]*)\]\((sys|user):([^)]+)\)/g,

  // Matches @path/to/file.ext with supported extensions
  AT_PATH_PATTERN: /(@[^\s[\]()]+\.(?:md|json|js|ts|jsx|tsx|py|yaml|yml))\b/g,

  // Matches @directory/ or @directory patterns (directories without file extensions)
  AT_DIRECTORY_PATTERN: /(@[^\s[\]()]+\/)(?=\s|$|[^\w/])/g,

  // Matches bare base URI patterns like user:path/file.ext or sys:path/file.ext
  BARE_BASE_URI_PATTERN:
    /\b(user:|sys:)[^\s[\]()]+\.(?:md|json|js|ts|jsx|tsx|py|yaml|yml)(?:#[a-zA-Z0-9_-]+)?\b/g
}

// Check if a URL is absolute
export const is_absolute_url = (url) => {
  if (typeof url !== 'string') return false

  // Protocol-relative or explicit scheme with authority (e.g., https://, ssh://, git://)
  if (/^(?:[a-z][a-z0-9+\-.]*:)?\/\//i.test(url)) return true

  // Mail/telephone links
  if (/^(?:mailto|tel):/i.test(url)) return true

  return false
}

// Convert an absolute filesystem path under a known base directory back to
// its base URI form (e.g. `/abs/user-base/task/foo/` -> `user:task/foo/`).
// Returns null if the path does not live under a known base directory.
export const convert_path_to_base_uri = (absolute_path) => {
  if (typeof absolute_path !== 'string' || !absolute_path) return null

  const normalize = (dir) => dir.replace(/\/+$/, '')
  const user_root = normalize(BASE_DIRECTORIES.user)
  const system_root = normalize(BASE_DIRECTORIES.system)
  const input = normalize(absolute_path)

  const to_uri = (scheme, root) => {
    if (input === root) return `${scheme}`
    if (input.startsWith(root + '/')) {
      return `${scheme}${input.slice(root.length + 1)}`
    }
    return null
  }

  return to_uri('user:', user_root) || to_uri('sys:', system_root) || null
}

// Build the client-side route for a file's git history page
export const git_history_href = (base_uri) => {
  if (!base_uri) return null
  return `/git-history/${encodeURIComponent(base_uri)}`
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
const get_current_window_path = () => {
  return window.location.pathname
}

// Normalize URL path by removing leading slash
export const normalize_url_path = (url_path) => {
  if (!url_path) return ''
  return url_path.startsWith('/') ? url_path.slice(1) : url_path
}

// Convert URL path to filesystem path
export const convert_url_path_to_filesystem_path = (url_path) => {
  if (!url_path) {
    throw new Error('URL path is required')
  }

  const normalized_path = normalize_url_path(url_path)

  // Handle thread paths specially
  if (normalized_path.startsWith('thread/')) {
    const thread_parts = normalized_path.split('/')
    const thread_id = thread_parts[1]

    if (!thread_id) {
      throw new Error('Invalid thread path: missing thread ID')
    }

    // Always point to metadata.json for threads
    return `${BASE_DIRECTORIES.user}/thread/${thread_id}/metadata.json`
  }

  // Check if path maps to system directory
  if (normalized_path.startsWith(BASE_URI_PATHS['sys:'].slice(1))) {
    return `${BASE_DIRECTORIES.system}/${normalized_path.substring(BASE_URI_PATHS['sys:'].length)}`
  }

  // Default to user directory for all other paths
  return `${BASE_DIRECTORIES.user}/${normalized_path}`
}

// Resolve @<relative-path> to proper base URI using working directory context
export const resolve_at_path = (at_path, working_directory) => {
  if (!at_path || !at_path.startsWith('@')) {
    return null
  }

  // Remove the @ prefix
  const relative_path = at_path.substring(1)

  if (!working_directory) {
    // No working directory context, return as-is
    return null
  }

  // Resolve the path relative to working directory
  let resolved_path
  if (relative_path.startsWith('./')) {
    resolved_path = working_directory + '/' + relative_path.substring(2)
  } else if (relative_path.startsWith('../')) {
    let working_dir = working_directory
    let remaining_path = relative_path

    while (remaining_path.startsWith('../')) {
      const last_slash = working_dir.lastIndexOf('/')
      if (last_slash === -1) break
      working_dir = working_dir.substring(0, last_slash)
      remaining_path = remaining_path.substring(3)
    }

    resolved_path = working_dir + '/' + remaining_path
  } else {
    // Direct relative path
    resolved_path = working_directory + '/' + relative_path
  }

  // Normalize the path (remove any redundant ./ or ../)
  resolved_path = resolved_path.replace(/\/+/g, '/') // Remove double slashes
  const path_parts = resolved_path.split('/')
  const normalized_parts = []

  for (const part of path_parts) {
    if (part === '.' || part === '') {
      continue
    } else if (part === '..') {
      normalized_parts.pop()
    } else {
      normalized_parts.push(part)
    }
  }

  resolved_path = normalized_parts.join('/')

  // Determine if this maps to user: or sys: based on the resolved path
  if (resolved_path.startsWith(BASE_DIRECTORIES.system.replace(/^\//, ''))) {
    // Maps to system directory - create sys: URI
    const sys_relative_path = resolved_path.substring(
      BASE_DIRECTORIES.system.replace(/^\//, '').length + 1
    )
    return `sys:${sys_relative_path}`
  } else if (
    resolved_path.startsWith(BASE_DIRECTORIES.user.replace(/^\//, ''))
  ) {
    // Maps to user directory - create user: URI
    const user_relative_path = resolved_path.substring(
      BASE_DIRECTORIES.user.replace(/^\//, '').length + 1
    )
    return `user:${user_relative_path}`
  }

  // If we can't determine the base directory, assume user:
  return `user:${relative_path}`
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

  // Handle ./relative/path - explicitly relative to current directory
  if (relative_path.startsWith('./')) {
    return base_directory + '/' + relative_path.substring(2)
  }

  // Handle ../relative/path - explicitly relative navigation
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

  // Bare paths (no ./ or ../ prefix) are treated as root-relative.
  // In the entity system, bare paths like "task/foo.md" are entity
  // references that should resolve from root, not relative to the
  // current page directory. Use "./" prefix for true relative paths.
  return '/' + relative_path
}
