const GITHUB_REPO_REGEX = /https?:\/\/github\.com\/([^/]+)\/([^/\s?#]+)/

/**
 * Extract URLs from raw text using regex. Strips trailing punctuation
 * and deduplicates.
 *
 * @param {string} text - Raw text to extract URLs from
 * @returns {string[]} Extracted URLs
 */
export function extract_links_from_text(text) {
  if (!text) return []

  const url_regex = /https?:\/\/[^\s)<>]+/g
  const raw = text.match(url_regex) || []
  const seen = new Set()
  const urls = []

  for (const u of raw) {
    const cleaned = u.replace(/[.,;:!?)]+$/, '')
    if (!seen.has(cleaned)) {
      seen.add(cleaned)
      urls.push(cleaned)
    }
  }

  return urls
}

/**
 * Process a pre-parsed array of URLs (e.g. from Twitter expanded_urls).
 * Deduplicates without regex extraction.
 *
 * @param {string[]} urls - Pre-resolved URL array
 * @returns {string[]} Deduplicated URLs
 */
export function extract_links_from_urls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return []
  return [...new Set(urls)]
}

/**
 * Categorize URLs into github_links, blog_links, and external_links
 * based on hostname matching against a social media domain list.
 *
 * @param {string[]} urls - URLs to categorize
 * @param {string[]} social_media_domains - Domain strings to filter as social
 * @returns {{ github_links: string, blog_links: string, external_links: string }}
 *   JSON-stringified arrays for each category
 */
export function categorize_links(urls, social_media_domains = []) {
  const github_links = []
  const blog_links = []
  const external_links = []

  for (const url of urls) {
    let hostname
    try {
      hostname = new URL(url).hostname.toLowerCase()
    } catch {
      continue
    }

    const is_social = social_media_domains.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    )

    const github_match = url.match(GITHUB_REPO_REGEX)
    if (github_match) {
      github_links.push(url)
    }

    if (!is_social) {
      external_links.push(url)
      if (!github_match) {
        blog_links.push(url)
      }
    }
  }

  return {
    github_links: JSON.stringify(github_links),
    blog_links: JSON.stringify(blog_links),
    external_links: JSON.stringify(external_links)
  }
}
