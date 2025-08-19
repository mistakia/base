import {
  BASE_URI_PATTERNS,
  is_absolute_url,
  convert_base_uri_to_path,
  resolve_relative_path
} from './base-uri-constants.js'

// Process markdown content to transform links before rendering
export const process_links_in_markdown = (content) => {
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

    // Hash anchor - keep in-page navigation
    if (href.startsWith('#')) {
      link.setAttribute('data-internal-link', 'true')
      return
    }

    // App-absolute path - treat as internal
    if (href.startsWith('/')) {
      link.setAttribute('data-internal-link', 'true')
      return
    }

    // Relative path - resolve against current path
    const resolved_path = resolve_relative_path(href)
    link.setAttribute('href', resolved_path)
    link.setAttribute('data-internal-link', 'true')
  })

  return temp_div.innerHTML
}

// Handle click events for internal links
export const handle_link_click = (event) => {
  const link = event.target.closest('a[data-internal-link]')
  if (!link) return

  const href = link.getAttribute('href')
  if (!href) return

  // Allow default behavior for in-page anchors
  if (href.startsWith('#')) return

  // Prevent default navigation for client-routed links
  event.preventDefault()

  // Use client-side routing (this would depend on your routing setup)
  // For now, we'll use window.history.pushState and manually navigate
  if (href.startsWith('/')) {
    window.history.pushState(null, '', href)
    // Trigger a popstate event to notify routing system
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
