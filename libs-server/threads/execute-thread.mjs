/**
 * @fileoverview Thread execution loop
 */

import debug from 'debug'
import { v4 as uuidv4 } from 'uuid'

import get_thread from './get-thread.mjs'
import { update_thread_state } from './update-thread.mjs'
import add_timeline_entry from './add-timeline-entry.mjs'
import generate_prompt from './generate-prompt.mjs'
import { is_blocking_tool_call } from './thread-tools.mjs'
import { get_provider } from '../inference-providers/index.mjs'
import { execute_tool } from '#libs-server/tools/registry.mjs'
import { THREAD_MESSAGE_ROLE } from './threads-constants.mjs'
import { register_workflow_tools } from '#libs-server/workflow/index.mjs'

// Import tool registry for workflow custom tools
import '#libs-server/tools/index.mjs'

const log = debug('threads:execute')

/**
 * Process a single tool call
 *
 * @param {Object} params Parameters for processing a tool call
 * @param {Object} params.thread Thread object
 * @param {Object} params.tool_call Tool call to process
 * @returns {Promise<Object>} Result of the tool execution
 */
const process_tool_call = async ({ thread, tool_call }) => {
  log(`Processing tool call: ${tool_call.tool_name}`)

  try {
    // Create execution context
    const context = {
      thread_id: thread.thread_id
    }

    // Execute the tool
    const result = await execute_tool({
      tool_name: tool_call.tool_name,
      parameters: tool_call.tool_parameters,
      context
    })

    // Add timeline entry for tool execution
    await add_timeline_entry({
      thread_id: thread.thread_id,
      entry: {
        id: tool_call.id,
        timestamp: new Date().toISOString(),
        type: 'tool_result',
        content: {
          tool_name: tool_call.tool_name,
          parameters: tool_call.tool_parameters,
          result
        }
      }
    })

    return result
  } catch (error) {
    log(`Error executing tool ${tool_call.tool_name}: ${error.message}`)

    const error_result = {
      success: false,
      error: error.message,
      tool_name: tool_call.tool_name
    }

    // Add timeline entry for tool error
    await add_timeline_entry({
      thread_id: thread.thread_id,
      entry: {
        id: tool_call.id,
        timestamp: new Date().toISOString(),
        type: 'tool_result',
        content: {
          tool_name: tool_call.tool_name,
          parameters: tool_call.tool_parameters,
          result: error_result
        }
      }
    })

    return error_result
  }
}

/**
 * Process the streaming response from an inference provider
 *
 * @param {Object} params Processing parameters
 * @param {ReadableStream} params.structured_stream Stream with structured data
 * @param {Function} params.on_text Callback function for text updates
 * @param {Function} params.on_tool_call Callback function for tool calls
 * @returns {Promise<Object>} Final response data
 */
const process_stream = async ({
  structured_stream,
  on_text = () => {},
  on_tool_call = () => {}
}) => {
  let full_response = ''
  let formatted_response = ''
  const tool_calls = []
  const processed_tool_call_ids = new Set()

  const reader = structured_stream.getReader()

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) {
        break
      }

      if (!value) continue

      // Update responses
      if (value.full_text) {
        full_response = value.full_text
      }

      // Handle new text output
      if (value.text && value.text.trim()) {
        // Use formatted text if available, otherwise use raw text
        if (value.formatted_text) {
          const new_formatted_text = value.formatted_text.slice(
            formatted_response.length
          )
          if (new_formatted_text.trim()) {
            on_text(new_formatted_text)
          }
          formatted_response = value.formatted_text
        } else {
          on_text(value.text)
        }
      }

      // Process tool calls if present
      if (value.tool_calls && value.tool_calls.length > 0) {
        for (const tool_call of value.tool_calls) {
          // Create a unique ID for the tool call based on name and params
          // Create a unique ID for the tool call based on name and params
          const tool_call_id = `${tool_call.tool_name}:${JSON.stringify(tool_call.tool_parameters)}`

          // Only process this tool call if we haven't seen it before
          if (!processed_tool_call_ids.has(tool_call_id)) {
            on_tool_call(tool_call)
            processed_tool_call_ids.add(tool_call_id)
            tool_calls.push(tool_call)
          }
        }
      }

      // Break if the model signals completion
      if (value.done) {
        break
      }
    }
  } catch (error) {
    log('Stream processing error:', error)
    throw error
  } finally {
    reader.releaseLock()
  }

  return { text: full_response, tool_calls }
}

/**
 * Make an inference request to the provider
 *
 * @param {Object} params Inference request parameters
 * @param {Object} params.thread Thread object
 * @param {string} params.prompt Prompt text
 * @param {Function} params.on_text Callback for text updates
 * @param {Function} params.on_tool_call Callback for tool calls
 * @returns {Promise<Object>} Response from the inference
 */
const make_inference_request = async ({
  thread,
  prompt,
  on_text = () => {},
  on_tool_call = () => {}
}) => {
  const { thread_id, inference_provider, model } = thread

  log(
    `Making inference request for thread ${thread_id} to ${inference_provider} using model ${model}`
  )

  try {
    const provider = get_provider(inference_provider)

    if (!provider) {
      throw new Error(`Provider ${inference_provider} not found`)
    }

    // Add timeline entry for message
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'message',
        role: THREAD_MESSAGE_ROLE.SYSTEM,
        content: {
          message: 'Generating inference response'
        }
      }
    })

    // Generate stream
    const response_stream = await provider.generate_stream({
      model,
      prompt,
      options: {}
    })

    // Process the stream
    const response_data = await process_stream({
      structured_stream: response_stream,
      on_text,
      on_tool_call
    })

    // Add timeline entry for assistant response
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'message',
        role: THREAD_MESSAGE_ROLE.THREAD_AGENT,
        content: {
          message: response_data.text
        }
      }
    })

    return response_data
  } catch (error) {
    log('Inference request error:', error)

    // Add timeline entry for error
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'error',
        error_type: 'inference_error',
        message: `Inference request failed: ${error.message}`,
        content: {
          error: error.message
        }
      }
    })

    throw error
  }
}

/**
 * Execute a thread
 *
 * @param {Object} params Thread execution parameters
 * @param {string} params.thread_id ID of the thread to execute
 * @param {Function} params.on_text Callback for text output
 * @param {Function} params.on_tool_call Callback for tool calls
 * @param {Function} params.on_tool_result Callback for tool results
 * @param {Function} params.on_completion Callback when execution completes
 * @param {boolean} params.auto_execute_tools Whether to automatically execute tools
 * @param {boolean} params.continuous Whether to run continuously until completion or blocking tool
 * @param {number} params.max_iterations Maximum number of iterations for continuous execution (default: 50)
 * @returns {Promise<Object>} Result of the execution
 */
export const execute_thread = async ({
  thread_id,
  on_text = () => {},
  on_tool_call = () => {},
  on_tool_result = () => {},
  on_completion = () => {},
  auto_execute_tools = true,
  continuous = false,
  max_iterations = 50
}) => {
  log(`Executing thread ${thread_id}${continuous ? ' (continuous mode)' : ''}`)

  let iteration_count = 0
  let last_result = null

  // Continuous execution loop
  do {
    iteration_count++

    if (continuous && iteration_count > max_iterations) {
      log(`Max iterations (${max_iterations}) reached for thread ${thread_id}`)

      // Add timeline entry for max iterations reached
      await add_timeline_entry({
        thread_id,
        entry: {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: 'state_change',
          content: {
            from_state: 'active',
            to_state: 'paused',
            reason: `Maximum iterations (${max_iterations}) reached in continuous execution`
          }
        }
      })

      // Update thread state to paused
      await update_thread_state({
        thread_id,
        thread_state: 'paused',
        reason: 'Maximum iterations reached in continuous execution'
      })

      break
    }

    try {
      // Execute single iteration
      last_result = await execute_single_iteration({
        thread_id,
        on_text,
        on_tool_call,
        on_tool_result,
        on_completion,
        auto_execute_tools,
        iteration_count
      })

      // If not in continuous mode, break after first iteration
      if (!continuous) {
        break
      }

      // In continuous mode, check if we should continue
      if (last_result.blocking_tool_encountered) {
        log(
          `Stopping continuous execution due to blocking tool: ${last_result.execution_stopping_tool}`
        )
        break
      }

      // Add delay between iterations to prevent excessive API calls
      if (continuous && iteration_count < max_iterations) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch (error) {
      log(`Error in iteration ${iteration_count}: ${error.message}`)
      throw error
    }
  } while (!last_result?.blocking_tool_encountered)

  return {
    ...last_result,
    iteration_count,
    continuous_mode: continuous
  }
}

/**
 * Execute a single iteration of thread processing
 *
 * @param {Object} params Single iteration parameters
 * @returns {Promise<Object>} Result of the single iteration
 */
const execute_single_iteration = async ({
  thread_id,
  on_text,
  on_tool_call,
  on_tool_result,
  on_completion,
  auto_execute_tools,
  iteration_count
}) => {
  try {
    // Get thread data
    const thread = await get_thread({
      thread_id
    })

    // Register workflow tools if this thread has a workflow
    if (thread.workflow_base_uri) {
      await register_workflow_tools({
        workflow_base_uri: thread.workflow_base_uri
      })
    }

    // Generate prompt
    const prompt_data = await generate_prompt({
      thread_id
    })

    // Update thread state to active if not already
    if (thread.thread_state !== 'active') {
      await update_thread_state({
        thread_id,
        thread_state: 'active'
      })

      // Add timeline entry for state change
      await add_timeline_entry({
        thread_id,
        entry: {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: 'state_change',
          content: {
            from_state: thread.thread_state,
            to_state: 'active',
            reason: `Thread execution started (iteration ${iteration_count})`
          }
        }
      })
    }

    log(
      'Prompt text prepared for inference (length: %d)',
      prompt_data.prompt_text?.length || 0
    )

    // Make inference request
    const response = await make_inference_request({
      thread,
      prompt: prompt_data.prompt_text,
      on_text,
      on_tool_call
    })

    // Handle tool calls
    let blocking_tool_encountered = false
    let execution_stopping_tool = null

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const tool_call of response.tool_calls) {
        // Check if this is a blocking tool call
        if (is_blocking_tool_call(tool_call)) {
          blocking_tool_encountered = true
          execution_stopping_tool = tool_call.tool_name

          // Process the tool call if auto-executing
          if (auto_execute_tools) {
            const result = await process_tool_call({
              thread,
              tool_call
            })

            // Notify callback
            on_tool_result(tool_call, result)

            // Break after processing blocking tool
            break
          } else {
            // Just notify callback without executing
            on_tool_result(tool_call, {
              success: false,
              message: 'Tool execution disabled'
            })
            break
          }
        } else {
          // Non-blocking tool - execute if auto-executing
          if (auto_execute_tools) {
            const result = await process_tool_call({
              thread,
              tool_call
            })

            // Notify callback
            on_tool_result(tool_call, result)
          } else {
            // Just notify callback without executing
            on_tool_result(tool_call, {
              success: false,
              message: 'Tool execution disabled'
            })
          }
        }
      }
    }

    // Add timeline entry for assistant response
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'assistant_response',
        content: {
          text: response.text,
          tool_calls: response.tool_calls || []
        }
      }
    })

    // Notify completion callback
    on_completion({
      text: response.text,
      tool_calls: response.tool_calls || [],
      blocking_tool_encountered,
      execution_stopping_tool
    })

    return {
      success: true,
      text: response.text,
      tool_calls: response.tool_calls || [],
      blocking_tool_encountered,
      execution_stopping_tool
    }
  } catch (error) {
    log(`Error in single iteration: ${error.message}`)
    throw error
  }
}

export default execute_thread
