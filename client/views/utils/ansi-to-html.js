/**
 * ANSI escape code to HTML converter utility
 * Parses ANSI SGR (Select Graphic Rendition) codes and converts them to HTML elements with inline styles
 */

const parse_ansi_escape_codes = (text) => {
  if (typeof text !== 'string') return []

  // eslint-disable-next-line no-control-regex
  const ansi_regex = /\u001b\[([0-9;]*)([a-zA-Z])/g
  const elements = []
  let last_index = 0
  let match
  let current_styles = {}

  while ((match = ansi_regex.exec(text)) !== null) {
    // Add text before the escape code
    if (match.index > last_index) {
      const text_content = text.slice(last_index, match.index)
      if (text_content) {
        elements.push({
          type: 'text',
          content: text_content,
          styles: { ...current_styles }
        })
      }
    }

    // Parse the escape code
    const codes = match[1]
      ? match[1].split(';').map((c) => parseInt(c, 10))
      : [0]
    const command = match[2]

    if (command === 'm') {
      // SGR (Select Graphic Rendition) parameters
      codes.forEach((code) => {
        switch (code) {
          case 0:
            // Reset all attributes
            current_styles = {}
            break
          case 1:
            // Bold
            current_styles.fontWeight = 'bold'
            break
          case 2:
            // Dim/faint
            current_styles.opacity = 0.6
            break
          case 3:
            // Italic
            current_styles.fontStyle = 'italic'
            break
          case 4:
            // Underline
            current_styles.textDecoration = 'underline'
            break
          case 22:
            // Normal intensity (not bold or dim)
            delete current_styles.fontWeight
            delete current_styles.opacity
            break
          case 23:
            // Not italic
            delete current_styles.fontStyle
            break
          case 24:
            // Not underlined
            delete current_styles.textDecoration
            break
          case 30:
            current_styles.color = '#000000'
            break
          case 31:
            current_styles.color = '#cd0000'
            break
          case 32:
            current_styles.color = '#00cd00'
            break
          case 33:
            current_styles.color = '#cdcd00'
            break
          case 34:
            current_styles.color = '#0000ee'
            break
          case 35:
            current_styles.color = '#cd00cd'
            break
          case 36:
            current_styles.color = '#00cdcd'
            break
          case 37:
            current_styles.color = '#e5e5e5'
            break
          case 39:
            // Default foreground color
            delete current_styles.color
            break
          case 90:
            current_styles.color = '#7f7f7f'
            break
          case 91:
            current_styles.color = '#ff0000'
            break
          case 92:
            current_styles.color = '#00ff00'
            break
          case 93:
            current_styles.color = '#ffff00'
            break
          case 94:
            current_styles.color = '#5c5cff'
            break
          case 95:
            current_styles.color = '#ff00ff'
            break
          case 96:
            current_styles.color = '#00ffff'
            break
          case 97:
            current_styles.color = '#ffffff'
            break
          // Background colors (40-47, 100-107)
          case 40:
            current_styles.backgroundColor = '#000000'
            break
          case 41:
            current_styles.backgroundColor = '#cd0000'
            break
          case 42:
            current_styles.backgroundColor = '#00cd00'
            break
          case 43:
            current_styles.backgroundColor = '#cdcd00'
            break
          case 44:
            current_styles.backgroundColor = '#0000ee'
            break
          case 45:
            current_styles.backgroundColor = '#cd00cd'
            break
          case 46:
            current_styles.backgroundColor = '#00cdcd'
            break
          case 47:
            current_styles.backgroundColor = '#e5e5e5'
            break
          case 49:
            // Default background color
            delete current_styles.backgroundColor
            break
          case 100:
            current_styles.backgroundColor = '#7f7f7f'
            break
          case 101:
            current_styles.backgroundColor = '#ff0000'
            break
          case 102:
            current_styles.backgroundColor = '#00ff00'
            break
          case 103:
            current_styles.backgroundColor = '#ffff00'
            break
          case 104:
            current_styles.backgroundColor = '#5c5cff'
            break
          case 105:
            current_styles.backgroundColor = '#ff00ff'
            break
          case 106:
            current_styles.backgroundColor = '#00ffff'
            break
          case 107:
            current_styles.backgroundColor = '#ffffff'
            break
        }
      })
    }

    last_index = ansi_regex.lastIndex
  }

  // Add remaining text
  if (last_index < text.length) {
    const text_content = text.slice(last_index)
    if (text_content) {
      elements.push({
        type: 'text',
        content: text_content,
        styles: { ...current_styles }
      })
    }
  }

  return elements.length > 0
    ? elements
    : [{ type: 'text', content: text, styles: {} }]
}

/**
 * Convert ANSI escape codes to HTML elements
 * @param {string} text - Text containing ANSI escape codes
 * @returns {Array} Array of React elements/strings to render
 */
export const ansi_to_html = (text) => {
  const elements = parse_ansi_escape_codes(text)

  return elements
    .map((element, index) => {
      if (element.type === 'text') {
        const has_styles = Object.keys(element.styles).length > 0

        if (has_styles) {
          // Return a React element descriptor that can be used with React.createElement
          return {
            type: 'span',
            key: index,
            props: {
              style: element.styles,
              children: element.content
            }
          }
        } else {
          return element.content
        }
      }
      return null
    })
    .filter(Boolean)
}

/**
 * Strip ANSI escape codes from text, returning plain text
 * @param {string} text - Text containing ANSI escape codes
 * @returns {string} Plain text without ANSI codes
 */
export const strip_ansi_codes = (text) => {
  if (typeof text !== 'string') return text

  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[([0-9;]*[a-zA-Z])/g, '')
}
