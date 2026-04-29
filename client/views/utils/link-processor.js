import {
  BASE_URI_PATTERNS,
  is_absolute_url,
  convert_base_uri_to_path,
  resolve_relative_path,
  resolve_at_path
} from './base-uri-constants.js'
import { transform_outside_inline_code } from './inline-code-parser.js'

// Combined pattern matching wiki links, base-URI markdown links, and bare
// base URIs. Used to find linkable references inside fenced/inline code
// blocks where markdown-it's normal link processing does not run.
const CODE_BLOCK_LINK_PATTERN =
  /\[\[(sys|user):([^\]|]+)(?:\|([^\]]*))?\]\]|\[([^\]]*)\]\((sys|user):([^)]+)\)|\b(?:user:|sys:)[^\s[\]()]+\.(?:md|json|js|ts|jsx|tsx|py|yaml|yml)(?:#[a-zA-Z0-9_-]+)?\b/g

// Apply a transformation only to lines outside fenced code blocks. Fenced
// content must reach the renderer untouched so wiki/base URI patterns survive
// into the rendered <pre><code> where convert_links_in_code_blocks can wrap
// them in anchors.
const transform_outside_fenced_code = (content, transform_fn) => {
  if (!content) return content

  const lines = content.split('\n')
  const fence_regex = /^ {0,3}```/
  let in_fence = false
  let buffer = []
  const output = []

  const flush = () => {
    if (buffer.length === 0) return
    output.push(transform_fn(buffer.join('\n')))
    buffer = []
  }

  for (const line of lines) {
    if (fence_regex.test(line)) {
      flush()
      output.push(line)
      in_fence = !in_fence
      continue
    }
    if (in_fence) {
      output.push(line)
    } else {
      buffer.push(line)
    }
  }
  flush()

  return output.join('\n')
}

// Process markdown content to transform links before rendering. Fenced code
// blocks are left untouched here -- their wiki/base URI patterns are wrapped
// in anchors after rendering by convert_links_in_code_blocks.
export const process_links_in_markdown = (
  content,
  working_directory = null
) => {
  if (!content) return content

  return transform_outside_fenced_code(content, (segment) =>
    process_links_in_markdown_segment(segment, working_directory)
  )
}

const process_links_in_markdown_segment = (content, working_directory) => {
  let processed_content = content

  // Transform base URI references wrapped in single backticks BEFORE the regular
  // transforms. Markdown-it would otherwise treat the backticks as an inline-code
  // span and never render the inner link as an anchor. We rewrite each pattern to
  // `[`label`](client_path)`, which renders as an anchor wrapping a code-styled
  // label so the visual code styling is preserved AND the link is clickable.
  //
  // Wiki link in backticks: `[[scheme:path]]` or `[[scheme:path|Display Text]]`
  processed_content = processed_content.replace(
    /`\[\[(sys|user):([^\]|]+)(?:\|([^\]]*))?\]\]`/g,
    (match, scheme, path, display_text) => {
      const base_uri = `${scheme}:${path}`
      const client_path = convert_base_uri_to_path(base_uri)
      const label =
        display_text != null
          ? display_text
          : client_path.startsWith('/')
            ? client_path.slice(1)
            : client_path
      return `[\`${label}\`](${client_path})`
    }
  )

  // Markdown link in backticks: `[text](scheme:path)`
  processed_content = processed_content.replace(
    /`\[([^\]]*)\]\((sys|user):([^)]+)\)`/g,
    (match, text, scheme, path) => {
      const base_uri = `${scheme}:${path}`
      const client_path = convert_base_uri_to_path(base_uri)
      return `[\`${text}\`](${client_path})`
    }
  )

  // Bare base URI in backticks: `scheme:path/file.ext`
  processed_content = processed_content.replace(
    /`((?:sys|user):[^\s`]+\.(?:md|json|js|ts|jsx|tsx|py|yaml|yml)(?:#[a-zA-Z0-9_-]+)?)`/g,
    (match, base_uri) => {
      const client_path = convert_base_uri_to_path(base_uri)
      const filename = base_uri.split('/').pop()
      return `[\`${filename}\`](${client_path})`
    }
  )

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

// Walk text nodes inside <code>/<pre> elements and convert wiki link, base
// URI markdown link, and bare base URI patterns into anchor elements.
// Highlighting markup around matches is preserved (we replace text nodes,
// not their surrounding spans).
const convert_links_in_code_blocks = (html) => {
  const temp_div = document.createElement('div')
  temp_div.innerHTML = html

  const walker = document.createTreeWalker(temp_div, NodeFilter.SHOW_TEXT, null)

  const replacements = []
  let node
  while ((node = walker.nextNode())) {
    let inside_code = false
    let ancestor = node.parentElement
    while (ancestor && ancestor !== temp_div) {
      const tag = ancestor.tagName?.toLowerCase()
      if (tag === 'a') {
        inside_code = false
        break
      }
      if (tag === 'code' || tag === 'pre') {
        inside_code = true
      }
      ancestor = ancestor.parentElement
    }
    if (!inside_code) continue

    CODE_BLOCK_LINK_PATTERN.lastIndex = 0
    if (CODE_BLOCK_LINK_PATTERN.test(node.textContent)) {
      replacements.push(node)
    }
  }

  for (const text_node of replacements) {
    const fragment = document.createDocumentFragment()
    const text = text_node.textContent
    let last_index = 0
    let match

    CODE_BLOCK_LINK_PATTERN.lastIndex = 0
    while ((match = CODE_BLOCK_LINK_PATTERN.exec(text)) !== null) {
      if (match.index > last_index) {
        fragment.appendChild(
          document.createTextNode(text.slice(last_index, match.index))
        )
      }

      const matched = match[0]
      let href
      let label

      if (matched.startsWith('[[')) {
        const scheme = match[1]
        const path = match[2]
        const display_text = match[3]
        href = convert_base_uri_to_path(`${scheme}:${path}`)
        label = display_text != null && display_text !== '' ? display_text : matched
      } else if (matched.startsWith('[')) {
        const scheme = match[5]
        const path = match[6]
        href = convert_base_uri_to_path(`${scheme}:${path}`)
        label = matched
      } else {
        href = convert_base_uri_to_path(matched)
        label = matched
      }

      const link = document.createElement('a')
      link.setAttribute('href', href)
      link.textContent = label
      fragment.appendChild(link)

      last_index = match.index + matched.length
    }

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

  // Convert base URI / wiki link patterns that survive inside code blocks
  const html_with_code_links = convert_links_in_code_blocks(
    html_with_converted_links
  )

  // Create a temporary DOM element to parse HTML
  const temp_div = document.createElement('div')
  temp_div.innerHTML = html_with_code_links

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
