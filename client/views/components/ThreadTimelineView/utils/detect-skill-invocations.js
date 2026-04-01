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

export const detect_skill_invocations = (timeline_events) => {
  const paired_indices = new Set()
  const skill_groups = []

  for (let i = 0; i < timeline_events.length; i++) {
    if (paired_indices.has(i)) continue

    const event = timeline_events[i]
    if (event.type !== 'message' || event.role !== 'user') continue
    if (event.metadata?.is_meta) continue

    const content_string = get_content_string(event.content)
    const command_name = parse_content_tag(content_string, COMMAND_NAME_PATTERN)
    if (!command_name) continue

    // Look ahead for matching is_meta expansion with same timestamp
    const next_index = i + 1
    if (next_index >= timeline_events.length) continue

    const next_event = timeline_events[next_index]
    if (
      next_event.type !== 'message' ||
      next_event.role !== 'user' ||
      !next_event.metadata?.is_meta ||
      next_event.timestamp !== event.timestamp
    ) continue

    const command_args = parse_content_tag(content_string, COMMAND_ARGS_PATTERN)
    const expansion_content = get_content_string(next_event.content)
    const skill_path = parse_content_tag(expansion_content, SKILL_PATH_PATTERN)

    const skill_item = {
      command_event: event,
      expansion_event: next_event,
      command_name,
      command_args,
      skill_path
    }

    // Check if this pair can merge with the previous skill group (same timestamp)
    const last_group = skill_groups[skill_groups.length - 1]
    if (
      last_group &&
      last_group.skills[0].command_event.timestamp === event.timestamp
    ) {
      last_group.skills.push(skill_item)
      last_group.indices.push(i, next_index)
    } else {
      skill_groups.push({
        indices: [i, next_index],
        skills: [skill_item],
        user_text: command_args
      })
    }

    paired_indices.add(i)
    paired_indices.add(next_index)
  }

  return { paired_indices, skill_groups }
}
