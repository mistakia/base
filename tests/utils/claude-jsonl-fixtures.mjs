export const make_claude_entry = (uuid, index, type = null) => {
  const resolved_type = type || (index % 2 === 1 ? 'user' : 'assistant')
  return {
    uuid,
    parentUuid: index === 1 ? null : `uuid-${index - 1}`,
    timestamp: `2026-04-18T12:00:${String(index).padStart(2, '0')}.000Z`,
    type: resolved_type,
    cwd: '/tmp/cwd',
    message:
      resolved_type === 'user'
        ? { role: 'user', content: `msg ${index}` }
        : {
            role: 'assistant',
            content: [{ type: 'text', text: `reply ${index}` }],
            model: 'claude-opus-4-7'
          }
  }
}

export const serialize_claude_entries = (entries) =>
  entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
