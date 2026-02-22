import {
  BASE_URI_PATTERNS,
  is_absolute_url,
  convert_base_uri_to_path,
  resolve_relative_path,
  resolve_at_path
} from './base-uri-constants.js'
import { transform_outside_inline_code } from './inline-code-parser.js'

// Process markdown content to transform links before rendering
export const process_links_in_markdown = (
  content,
  working_directory = null
) => {
  if (!content) return content

  let processed_content = content

  // Transform wiki links [[scheme:path]] to markdown links
  processed_content = processed_content.replace(
    BASE_URI_PATTERNS.WIKI_LINK,
    (match, scheme, path) => {
      const base_uri = `${scheme}:${path}`
      const client_path = convert_base_uri_to_path(base_uri)
      const filename = path.split('/').pop().replace(/\.md$/, '')
      return `[${filename}](${client_path})`
    }
  )

  // Transform base URI markdown links [text](scheme:path)
  processed_content = processed_content.replace(
    BASE_URI_PATTERNS.MARKDOWN_LINK,
    (match, text, scheme, path) => {
      const base_uri = `${scheme}:${path}`
      const client_path = convert_base_uri_to_path(base_uri)
      return `[${text}](${client_path})`
    }
  )

  // Transform @<relative-path> patterns to markdown links (skip inline code)
  if (working_directory) {
    processed_content = transform_outside_inline_code(
      processed_content,
      (text) =>
        text.replace(BASE_URI_PATTERNS.AT_PATH_PATTERN, (match, at_path) => {
          const base_uri = resolve_at_path(at_path, working_directory)
          if (base_uri) {
            const client_path = convert_base_uri_to_path(base_uri)
            const filename = at_path.split('/').pop() // Keep full filename with extension
            return `[${filename}](${client_path})`
          }
          return match // Return as-is if cannot resolve
        })
    )

    // Transform @<directory> patterns to markdown links (skip inline code)
    processed_content = transform_outside_inline_code(
      processed_content,
      (text) =>
        text.replace(
          BASE_URI_PATTERNS.AT_DIRECTORY_PATTERN,
          (match, at_directory) => {
            const base_uri = resolve_at_path(at_directory, working_directory)
            if (base_uri) {
              const client_path = convert_base_uri_to_path(base_uri)
              const directory_name = at_directory.slice(1, -1) // Remove @ and trailing /
              return `[${directory_name}/](${client_path})`
            }
            return match // Return as-is if cannot resolve
          }
        )
    )
  }

  // Transform bare base URI patterns to markdown links (skip inline code)
  processed_content = transform_outside_inline_code(processed_content, (text) =>
    text.replace(BASE_URI_PATTERNS.BARE_BASE_URI_PATTERN, (match, scheme) => {
      const client_path = convert_base_uri_to_path(match)
      const filename = match.split('/').pop() // Keep full filename with extension
      return `[${filename}](${client_path})`
    })
  )

  return processed_content
}

// Add link attributes to rendered HTML
export const process_links_in_html = (html) => {
  if (!html) return html

  // Create a temporary DOM element to parse HTML
  const temp_div = document.createElement('div')
  temp_div.innerHTML = html

  // Find all links
  const links = temp_div.querySelectorAll('a[href]')

  links.forEach((link) => {
    let href = link.getAttribute('href')
    if (!href) return

    // Normalize whitespace to avoid malformed URLs like ' //https://...'
    href = href.trim()
    link.setAttribute('href', href)

    // External URLs - open in new tab and do not mark as internal
    if (is_absolute_url(href)) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
      link.removeAttribute('data-internal-link')
      return
    }

    // Hash anchor - keep in-page navigation (no new tab)
    if (href.startsWith('#')) {
      link.setAttribute('data-internal-link', 'true')
      return
    }

    // App-absolute path - treat as internal, navigate in same tab
    if (href.startsWith('/')) {
      link.setAttribute('data-internal-link', 'true')
      return
    }

    // Relative path - resolve against current path, navigate in same tab
    const resolved_path = resolve_relative_path(href)
    link.setAttribute('href', resolved_path)
    link.setAttribute('data-internal-link', 'true')
  })

  return temp_div.innerHTML
}
