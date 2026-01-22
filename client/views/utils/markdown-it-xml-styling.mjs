// Markdown-it plugin for XML tag styling with hierarchical color coding
// Adds visual styling for XML tags within markdown content

import { html_tag_whitelist } from './html-tag-whitelist.mjs'

export default function (md, options) {
  options = Object.assign(
    {
      colors: ['red', 'green', 'yellow', 'blue', 'purple']
    },
    options
  )

  // Use shared HTML tag whitelist
  const html_tags = html_tag_whitelist

  const tag_stack = []
  const tag_color_map = new Map() // Maps tag names to assigned colors
  const used_colors = new Set() // Track which colors have been used
  let seed = 1

  // Simple seeded random function for consistent color assignment
  const seeded_random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  // Get color for a specific tag name (unique per tag pair)
  const get_color_for_tag = (tag_name) => {
    // If we already assigned a color to this tag, return it
    if (tag_color_map.has(tag_name)) {
      return tag_color_map.get(tag_name)
    }

    // Find an unused color from the predefined palette
    let available_color = null
    for (const color of options.colors) {
      if (!used_colors.has(color)) {
        available_color = color
        break
      }
    }

    // If all predefined colors are used, pick a random one
    if (!available_color) {
      const random_index = Math.floor(seeded_random() * options.colors.length)
      available_color = options.colors[random_index]
    }

    // Assign the color to this tag and mark it as used
    tag_color_map.set(tag_name, available_color)
    used_colors.add(available_color)

    return available_color
  }

  // Check if a tag should be treated as XML (not HTML)
  const is_xml_tag = (tag_name) => {
    return !html_tags.has(tag_name.toLowerCase())
  }

  // Get hex color value for color name
  const get_color_hex = (color) => {
    const color_map = {
      red: '#ff3f3f',
      green: '#3f9f3f',
      yellow: '#ffbb3f',
      blue: '#3f3fff',
      'light-gray': '#9f9f9f',
      'dark-gray': '#3f3f3f',
      purple: '#800080'
    }
    return color_map[color] || '#000000'
  }

  // Override the render method to post-process the entire output
  const original_render = md.render
  md.render = function (src, env) {
    const result = original_render.call(this, src, env)

    // Protect code blocks from XML processing by replacing with placeholders
    const code_blocks = []
    const protected_result = result.replace(
      /<(pre|code)(\s[^>]*)?>[\s\S]*?<\/\1>/gi,
      (match) => {
        const placeholder = `__CODE_BLOCK_${code_blocks.length}__`
        code_blocks.push(match)
        return placeholder
      }
    )

    // Post-process to handle both escaped and unescaped XML tags
    let processed = protected_result
      // Handle both escaped (&lt;tag&gt;) and unescaped (<tag>) XML tags
      .replace(
        /(?:&lt;|<)\/?([a-zA-Z][a-zA-Z0-9_-]*)(?:[^&>]*?)?(?:&gt;|>)/g,
        (match, tag_name) => {
          // Only process XML tags, not HTML tags
          if (!is_xml_tag(tag_name)) {
            return match
          }

          const is_escaped = match.includes('&lt;')
          const is_closing =
            match.includes('/') &&
            (is_escaped
              ? match.indexOf('/') > match.indexOf('&lt;')
              : match.indexOf('/') === 1)
          const is_self_closing =
            match.includes('/') &&
            (is_escaped ? match.endsWith('/&gt;') : match.endsWith('/>'))

          // Convert escaped tags to unescaped for processing
          const unescaped_tag = is_escaped
            ? match
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
            : match

          if (is_closing) {
            const tag_info = find_matching_opening_tag(tag_stack, tag_name)
            if (tag_info) {
              const color_hex = get_color_hex(tag_info.color)
              const styled_tag = add_color_styling_to_tag(
                unescaped_tag,
                color_hex,
                true
              )
              remove_tag_from_stack(tag_stack, tag_name)
              return '</div>' + styled_tag
            }
            return match
          } else {
            const nesting_level = tag_stack.length
            const color = get_color_for_tag(tag_name) // Use tag-specific color
            const color_hex = get_color_hex(color)
            const styled_tag = add_color_styling_to_tag(
              unescaped_tag,
              color_hex,
              false
            )

            if (!is_self_closing) {
              tag_stack.push({ name: tag_name, level: nesting_level, color })

              // Add border styling for root level (nesting level 0)
              const borderStyle =
                nesting_level === 0
                  ? ` style="border-left: 1px solid ${color_hex};"`
                  : ''

              return (
                styled_tag +
                `<div class="xml-tag-content" data-nesting-level="${nesting_level}"${borderStyle}>`
              )
            } else {
              return styled_tag
            }
          }
        }
      )

    // Then remove unwanted paragraph wrapping around XML tags
    processed = processed
      .replace(
        /<p>(<div class="xml-tag-opening"[^>]*>[^<]+<\/div>)<\/p>/g,
        '$1'
      )
      .replace(
        /<p>(<div class="xml-tag-opening"[^>]*>[^<]+<\/div><div class="xml-tag-content"[^>]*>)/g,
        '$1'
      )
      .replace(
        /(<\/div><div class="xml-tag-closing"[^>]*>[^<]+<\/div>)<\/p>/g,
        '$1'
      )

    // Restore protected code blocks
    code_blocks.forEach((block, index) => {
      processed = processed.replace(`__CODE_BLOCK_${index}__`, block)
    })

    return processed
  }

  // Helper functions
  function find_matching_opening_tag(tag_stack, tag_name) {
    for (let i = tag_stack.length - 1; i >= 0; i--) {
      if (tag_stack[i].name === tag_name) {
        return tag_stack[i]
      }
    }
    return null
  }

  function remove_tag_from_stack(tag_stack, tag_name) {
    for (let i = tag_stack.length - 1; i >= 0; i--) {
      if (tag_stack[i].name === tag_name) {
        tag_stack.splice(i, 1)
        break
      }
    }
  }

  function add_color_styling_to_tag(tag, color_hex, is_closing = false) {
    // Escape HTML entities to display the tag as text
    const escaped_tag = tag
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    // Add class names for opening/closing tags
    const className = is_closing ? 'xml-tag-closing' : 'xml-tag-opening'

    // Wrap in a styled div to display as colored text
    return `<div class="${className}" style="color: ${color_hex}; font-weight: bold;">${escaped_tag}</div>`
  }
}
