const parse_content_tag = (content_string, pattern) => {
  if (!content_string || typeof content_string !== 'string') return null
  const match = content_string.match(pattern)
  return match ? match[1].trim() || null : null
}

const COMMAND_NAME_PATTERN = /<command-name>([\s\S]*?)<\/command-name>/i
const COMMAND_ARGS_PATTERN = /<command-args>([\s\S]*?)<\/command-args>/i
const SKILL_PATH_PATTERN = /^Base directory for this skill:\s*(.+)/m

export const get_content_string = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === 'string'
          ? item
          : (item && typeof item === 'object' ? item.text || item.content || '' : '')
      )
      .join('\n')
  }
  if (content && typeof content === 'object') {
    return content.text || content.content || ''
  }
  return ''
}

const extract_command_name_from_path = (skill_path) => {
  if (!skill_path) return null
  const segments = skill_path.split('/')
  const last = segments[segments.length - 1]
  return last ? `/${last}` : null
}

export const detect_skill_invocations = (timeline_events) => {
  const paired_indices = new Set()
  const skill_groups = []

  // Anchor on is_meta expansion messages and look backward for the command message
  for (let i = 0; i < timeline_events.length; i++) {
    if (paired_indices.has(i)) continue

    const event = timeline_events[i]
    if (
      event.type !== 'message' ||
      event.role !== 'user' ||
      !event.metadata?.is_meta
    ) continue

    const expansion_content = get_content_string(event.content)
    const skill_path = parse_content_tag(expansion_content, SKILL_PATH_PATTERN)
    if (!skill_path) continue

    // Look backward for the nearest preceding user message (non-meta).
    // Allow already-paired command messages so multiple expansions from
    // the same user prompt merge into one skill group.
    let command_index = null
    for (let j = i - 1; j >= 0; j--) {
      const candidate = timeline_events[j]
      if (candidate.type !== 'message' || candidate.role !== 'user') continue
      if (candidate.metadata?.is_meta) continue
      command_index = j
      break
    }

    if (command_index === null) continue

    const command_event = timeline_events[command_index]
    const command_content = get_content_string(command_event.content)

    // Extract command name from tags if present, otherwise from skill path
    const command_name =
      parse_content_tag(command_content, COMMAND_NAME_PATTERN) ||
      extract_command_name_from_path(skill_path)
    if (!command_name) continue

    const command_args = parse_content_tag(command_content, COMMAND_ARGS_PATTERN)

    // Determine user_text: for tagged commands, use command_args;
    // for untagged (inline) commands, use the full user message content
    const has_command_tags = !!parse_content_tag(command_content, COMMAND_NAME_PATTERN)
    const user_text = has_command_tags ? command_args : command_content

    const skill_item = {
      command_event,
      expansion_event: event,
      command_name,
      command_args,
      skill_path
    }

    // Check if this pair can merge with the previous skill group (same command message)
    const last_group = skill_groups[skill_groups.length - 1]
    if (
      last_group &&
      last_group.indices.includes(command_index)
    ) {
      last_group.skills.push(skill_item)
      last_group.indices.push(i)
    } else {
      skill_groups.push({
        indices: [command_index, i],
        skills: [skill_item],
        user_text
      })
    }

    paired_indices.add(command_index)
    paired_indices.add(i)
  }

  return { paired_indices, skill_groups }
}
