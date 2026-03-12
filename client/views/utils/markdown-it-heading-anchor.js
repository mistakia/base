// Markdown-it plugin for heading anchor IDs
// Generates stable, GitHub-style slugified IDs on heading elements
// and injects a clickable anchor link for section linking

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export default function markdown_it_heading_anchor(md) {
  md.core.ruler.push('heading-anchor', function (state) {
    const seen_slugs = new Map()
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (token.type !== 'heading_open') continue

      // Get the inline content from the next token
      const inline_token = state.tokens[i + 1]
      if (!inline_token || inline_token.type !== 'inline') continue

      let slug = slugify(inline_token.content)
      if (!slug) continue

      // Handle duplicate slugs by appending -1, -2, etc.
      const base_slug = slug
      const count = seen_slugs.get(base_slug) || 0
      if (count > 0) {
        slug = `${base_slug}-${count}`
      }
      seen_slugs.set(base_slug, count + 1)

      token.attrSet('id', slug)

      // Inject an anchor link as the first child of the heading inline content
      const anchor_token = new state.Token('html_inline', '', 0)
      anchor_token.content = `<a class="heading-anchor-link" href="#${slug}" data-heading-anchor aria-label="Copy link to section"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-.025 9.45a.75.75 0 01-1.06-1.06l-1.25 1.25a2 2 0 01-2.83-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25z"/></svg></a>`
      if (!inline_token.children) {
        inline_token.children = []
      }
      inline_token.children.unshift(anchor_token)
    }
  })
}
