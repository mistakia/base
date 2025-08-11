export const clean_trailing_backslashes = ({ content_string }) => {
  if (!content_string || typeof content_string !== 'string')
    return content_string
  return content_string.replace(/\\\s*\n/g, '\n').replace(/\\\s*$/g, '')
}

export const extract_local_command_stdout = ({ content_string }) => {
  if (!content_string || typeof content_string !== 'string') return null

  const decoded = content_string
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

  const regex = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/i
  const match = decoded.match(regex)
  if (!match) return null

  return match[1].trim()
}

export const normalize_content = (content) => {
  return typeof content === 'string'
    ? content
    : content
      ? JSON.stringify(content)
      : ''
}

export const process_message_content = ({ content }) => {
  let processed_content = normalize_content(content)
  processed_content = clean_trailing_backslashes({
    content_string: processed_content
  })

  const local_command_stdout = extract_local_command_stdout({
    content_string: processed_content
  })
  if (local_command_stdout !== null) {
    return {
      content: local_command_stdout,
      is_empty: local_command_stdout.length === 0
    }
  }

  return {
    content: processed_content,
    is_empty: processed_content.trim().length === 0
  }
}
