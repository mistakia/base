/**
 * Normalize a thread to the unified card format used by SessionCard.
 * Shared between HomeSessionsPanel and FloatingSessionsPanel.
 * @param {Object} thread - Thread from Redux
 * @returns {Object} Normalized item for SessionCard
 */
const normalize_thread = (thread) => {
  const working_directory =
    thread.working_directory ||
    thread.external_session?.provider_metadata?.working_directory

  const duration_minutes =
    thread.duration_minutes ||
    thread.external_session?.provider_metadata?.duration_minutes

  const can_write = thread.can_write !== false

  return {
    id: thread.thread_id,
    title: thread.title || thread.prompt_snippet || null,
    session_status: thread.session_status || null,
    thread_state: thread.thread_state || null,
    user_message_count: thread.user_message_count || 0,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    working_directory,
    message_count: thread.message_count,
    duration_minutes,
    total_tokens:
      thread.total_tokens || thread.external_session?.provider_metadata?.total_tokens,
    latest_timeline_event: thread.latest_timeline_event || null,
    user_public_key: thread.user_public_key || null,
    show_actions: thread.thread_state === 'active' && can_write
  }
}

export default normalize_thread
