import debug from 'debug'

import get_thread from './get-thread.mjs'
import {
  build_prompt,
  generate_system_prompt,
  generate_activity_prompt,
  generate_tools_prompt,
  generate_guidelines_prompt,
  load_prompt
} from '#libs-server/prompts/index.mjs'

const log = debug('threads:generate_prompt')

/**
 * Generate a prompt for inference based on thread data and optional timeline entry ID
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to generate prompt for
 * @param {string} [params.timeline_id] Optional specific timeline entry ID to prompt from
 * @param {string} [params.user_base_directory] Custom user base directory
 * @param {string} [params.system_base_directory] System base directory
 * @returns {Promise<Object>} Object containing formatted messages for inference
 * @throws {Error} If no thread_main_request entry exists in the timeline
 */
export default async function generate_prompt({
  thread_id,
  timeline_id,
  user_base_directory,
  system_base_directory
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(
    `Generating prompt for thread ${thread_id}${timeline_id ? ` from timeline entry ${timeline_id}` : ''}`
  )

  // Get thread data
  const thread = await get_thread({ thread_id, user_base_directory })

  // Get timeline entries
  const timeline = thread.timeline || []

  // If timeline_id is provided, get all entries up to that ID
  // Otherwise, use the entire timeline
  const timeline_entries = timeline_id
    ? timeline.slice(
        0,
        timeline.findIndex((entry) => entry.id === timeline_id) + 1
      )
    : timeline

  // Generate system prompt component
  const system_prompt = await generate_system_prompt()

  // Generate activity prompt if thread has an activity ID
  let activity_prompt = ''
  let guidelines_prompt = ''

  if (thread.activity_id) {
    const activity_result = await generate_activity_prompt({
      activity_id: thread.activity_id,
      system_base_directory,
      user_base_directory
    })

    activity_prompt = activity_result.prompt

    // Generate guidelines prompt from the activity's guideline_ids
    if (
      activity_result.guideline_ids &&
      activity_result.guideline_ids.length > 0
    ) {
      guidelines_prompt = await generate_guidelines_prompt({
        guideline_ids: activity_result.guideline_ids,
        system_base_directory,
        user_base_directory
      })
    }
  }

  // Generate tools prompt if thread has tools
  let tools_prompt = ''
  let tool_call_guideline = ''
  if (thread.tools && thread.tools.length > 0) {
    tools_prompt = await generate_tools_prompt({
      tool_names: thread.tools,
      format: 'json'
    })

    // Add the tool_call prompt when tools are present
    const tool_call_prompt = await load_prompt({
      prompt_path: 'system/prompt/tool-call.md'
    })
    tool_call_guideline = tool_call_prompt.content

    // Combine with any existing guidelines
    if (guidelines_prompt && tool_call_guideline) {
      guidelines_prompt = `${tool_call_guideline}\n\n${guidelines_prompt}`
    } else if (tool_call_guideline) {
      guidelines_prompt = tool_call_guideline
    }
  }

  // Find the thread_main_request entry in the timeline
  const main_request_entry = timeline.find(
    (entry) => entry.type === 'thread_main_request'
  )

  // Throw an error if there's no thread_main_request entry
  if (!main_request_entry) {
    throw new Error(
      `Thread ${thread_id} does not have a thread_main_request entry`
    )
  }

  // Build the final prompt
  const prompt = await build_prompt({
    components: {
      system_prompt,
      activity_prompt,
      guidelines_prompt,
      tools: tools_prompt,
      main_request: main_request_entry.content
    },
    metadata: {
      thread_id,
      model: thread.model,
      inference_provider: thread.inference_provider,
      activity_id: thread.activity_id
    }
  })

  return {
    ...prompt,
    thread_id,
    activity_id: thread.activity_id,
    model: thread.model
  }
}
