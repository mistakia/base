import fs from 'fs/promises'
import path from 'path'

export const create_pi_thread_metadata = ({ thread_id, session_id }) => ({
  thread_id,
  thread_state: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  message_count: 0,
  tool_call_count: 0,
  user_message_count: 0,
  assistant_message_count: 0,
  context_input_tokens: 0,
  context_cache_creation_input_tokens: 0,
  context_cache_read_input_tokens: 0,
  cumulative_input_tokens: 0,
  cumulative_output_tokens: 0,
  cumulative_cache_creation_input_tokens: 0,
  cumulative_cache_read_input_tokens: 0,
  source: {
    provider: 'pi',
    session_id,
    imported_at: new Date().toISOString(),
    raw_data_saved: false,
    provider_metadata: {}
  }
})

export const seed_pi_thread = async ({
  user_base_directory,
  thread_id,
  session_id
}) => {
  const thread_dir = path.join(user_base_directory, 'thread', thread_id)
  await fs.mkdir(thread_dir, { recursive: true })
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(
      create_pi_thread_metadata({ thread_id, session_id }),
      null,
      2
    )
  )
  return thread_dir
}
