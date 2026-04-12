/**
 * Normalize a thread to the unified card format used by SessionCard.
 * Shared between HomeSessionsPanel and FloatingSessionsPanel.
 * @param {Object} thread - Thread from Redux
 * @returns {Object} Normalized item for SessionCard
 */
const normalize_thread = (thread) => {
  const working_directory =
    thread.working_directory ||
    thread.source?.provider_metadata?.working_directory

  const duration_minutes =
    thread.duration_minutes ||
    thread.source?.provider_metadata?.duration_minutes

  const can_write = thread.can_write !== false

  // Derive display status from session_status or thread_state
  let status = 'review'
  if (thread.session_status === 'active') {
    status = 'running'
  } else if (thread.session_status === 'idle') {
    status = 'idle'
  } else if (thread.session_status === 'queued' || thread.session_status === 'starting') {
    status = thread.session_status
  } else if (thread.session_status === 'failed') {
    status = 'failed'
  } else if (thread.session_status === 'completed') {
    status = 'review'
  } else if (thread.thread_state === 'archived') {
    status = 'archived'
  }

  return {
    id: thread.thread_id,
    title: thread.title || thread.prompt_snippet || null,
    status,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    working_directory,
    message_count: thread.message_count,
    duration_minutes,
    total_tokens:
      thread.total_tokens || thread.source?.provider_metadata?.total_tokens,
    latest_timeline_event: thread.latest_timeline_event || null,
    user_public_key: thread.user_public_key || null,
    show_actions: thread.thread_state === 'active' && can_write
  }
}

export default normalize_thread
