import debug from 'debug'

import get_thread from './get-thread.mjs'
import {
  build_prompt,
  generate_system_prompt,
  generate_workflow_prompt,
  generate_tools_prompt,
  generate_guidelines_prompt,
  load_prompt
} from '#libs-server/prompts/index.mjs'
import { register_workflow_tools } from '#libs-server/workflow/index.mjs'

const log = debug('threads:generate_prompt')

/**
 * Generate a prompt for inference based on thread data and optional timeline entry ID
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to generate prompt for
 * @param {string} [params.timeline_id] Optional specific timeline entry ID to prompt from
 * @returns {Promise<Object>} Object containing formatted messages for inference
 * @throws {Error} If no thread_main_request entry exists in the timeline
 */
export default async function generate_prompt({ thread_id, timeline_id }) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(
    `Generating prompt for thread ${thread_id}${timeline_id ? ` from timeline entry ${timeline_id}` : ''}`
  )

  // Get thread data
  const thread = await get_thread({ thread_id })

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

  // Generate workflow prompt if thread has a workflow (base relative path)
  let workflow_prompt = ''
  let guidelines_prompt = ''

  if (thread.workflow_base_uri) {
    // Register workflow tools before generating prompts
    await register_workflow_tools({
      workflow_base_uri: thread.workflow_base_uri
    })

    const workflow_result = await generate_workflow_prompt({
      base_uri: thread.workflow_base_uri,
      prompt_properties: thread.prompt_properties,
      timeline_entries
    })

    workflow_prompt = workflow_result.prompt

    // Generate guidelines prompt from the workflow's guideline paths
    if (
      workflow_result.guideline_base_uris &&
      workflow_result.guideline_base_uris.length > 0
    ) {
      guidelines_prompt = await generate_guidelines_prompt({
        guideline_base_uris: workflow_result.guideline_base_uris
      })
    }
  }

  // Generate tools prompt if thread has tools
  let tools_prompt = ''
  let tool_call_guideline = ''
  if (thread.tools && thread.tools.length > 0) {
    tools_prompt = await generate_tools_prompt({
      tool_names: thread.tools
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

  // Build the final prompt
  const prompt = await build_prompt({
    components: {
      system_prompt,
      workflow_prompt,
      guidelines_prompt,
      tools: tools_prompt
    },
    metadata: {
      thread_id,
      model: thread.model,
      inference_provider: thread.inference_provider,
      workflow_base_uri: thread.workflow_base_uri,
      timeline_entry_count: timeline_entries.length
    }
  })

  return {
    ...prompt,
    thread_id,
    workflow_base_uri: thread.workflow_base_uri,
    model: thread.model
  }
}
