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

  // Transform wiki links [[scheme:path]] or [[scheme:path|Display Text]] to markdown links
  processed_content = processed_content.replace(
    BASE_URI_PATTERNS.WIKI_LINK,
    (match, scheme, path, display_text) => {
      const base_uri = `${scheme}:${path}`
      const client_path = convert_base_uri_to_path(base_uri)
      const label =
        display_text != null
          ? display_text
          : client_path.startsWith('/')
            ? client_path.slice(1)
            : client_path
      return `[${label}](${client_path})`
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

// Convert markdown link syntax left unrendered inside HTML block elements.
// markdown-it treats content inside block-level HTML tags (e.g. <center>) as
// raw HTML per CommonMark, so [text](url) passes through as literal text.
const convert_unrendered_markdown_links = (html) => {
  const temp_div = document.createElement('div')
  temp_div.innerHTML = html

  const markdown_link_regex = /\[([^\]]+)\]\(([^)]+)\)/g

  const walker = document.createTreeWalker(temp_div, NodeFilter.SHOW_TEXT, null)

  const replacements = []
  let node
  while ((node = walker.nextNode())) {
    // Skip text inside <a>, <code>, <pre> elements
    const parent_tag = node.parentElement?.tagName?.toLowerCase()
    if (parent_tag === 'a' || parent_tag === 'code' || parent_tag === 'pre') {
      continue
    }

    if (markdown_link_regex.test(node.textContent)) {
      replacements.push(node)
    }
    markdown_link_regex.lastIndex = 0
  }

  for (const text_node of replacements) {
    const fragment = document.createDocumentFragment()
    const text = text_node.textContent
    let last_index = 0
    let match

    markdown_link_regex.lastIndex = 0
    while ((match = markdown_link_regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > last_index) {
        fragment.appendChild(
          document.createTextNode(text.slice(last_index, match.index))
        )
      }

      const link = document.createElement('a')
      link.href = match[2]
      link.textContent = match[1]
      fragment.appendChild(link)

      last_index = match.index + match[0].length
    }

    // Add remaining text after last match
    if (last_index < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(last_index)))
    }

    text_node.parentNode.replaceChild(fragment, text_node)
  }

  return temp_div.innerHTML
}

// Add link attributes to rendered HTML
export const process_links_in_html = (html) => {
  if (!html) return html

  // Convert any markdown link syntax that markdown-it left unrendered
  // (e.g. links inside block-level HTML elements like <center>)
  const html_with_converted_links = convert_unrendered_markdown_links(html)

  // Create a temporary DOM element to parse HTML
  const temp_div = document.createElement('div')
  temp_div.innerHTML = html_with_converted_links

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
