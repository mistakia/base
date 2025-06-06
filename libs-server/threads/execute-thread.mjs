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
import { get_tool, execute_tool } from '#libs-server/tools/registry.mjs'
import { THREAD_MESSAGE_ROLE } from './threads-constants.mjs'

// Import tool registry for workflow custom tools
import '#libs-server/tools/index.mjs'

const log = debug('threads:execute')

/**
 * Process a single tool call
 *
 * @param {Object} params Parameters for processing a tool call
 * @param {Object} params.thread Thread object
 * @param {Object} params.tool_call Tool call to process
 * @param {string} params.user_base_directory User base directory
 * @returns {Promise<Object>} Result of the tool execution
 */
const process_tool_call = async ({
  thread,
  tool_call,
  user_base_directory
}) => {
  const { thread_id } = thread
  const { tool_name, tool_parameters } = tool_call

  log(`Processing tool call ${tool_name} for thread ${thread_id}`)

  // First check if tool exists in the registry
  const tool = get_tool({ tool_name })

  if (!tool) {
    const error_message = `Tool ${tool_name} not found in registry`
    log(error_message)

    // Add timeline entry for tool call error
    await add_timeline_entry({
      thread_id,
      user_base_directory,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'error',
        error_type: 'tool_not_found',
        message: error_message,
        content: {
          tool_name,
          tool_parameters
        }
      }
    })

    return {
      success: false,
      error: error_message
    }
  }

  try {
    // Add timeline entry for tool call
    const tool_call_entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      content: {
        tool_name,
        tool_parameters
      }
    }

    await add_timeline_entry({
      thread_id,
      user_base_directory,
      entry: tool_call_entry
    })

    // Execute the tool through the centralized registry
    const execution_result = await execute_tool({
      tool_name,
      parameters: tool_parameters,
      thread_id,
      context: {
        thread_id,
        user_base_directory,
        thread
      }
    })

    // Check if execution was successful
    if (execution_result.status !== 'success') {
      throw new Error(execution_result.error || 'Unknown tool execution error')
    }

    const tool_result = execution_result.data

    // Add timeline entry for tool result
    const tool_result_entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'tool_result',
      content: {
        tool_name,
        tool_parameters,
        result: tool_result
      }
    }

    await add_timeline_entry({
      thread_id,
      user_base_directory,
      entry: tool_result_entry
    })

    return {
      success: true,
      tool_name,
      tool_parameters,
      result: tool_result
    }
  } catch (error) {
    const error_message = `Error executing tool ${tool_name}: ${error.message}`
    log(error_message)

    // Add timeline entry for tool error
    await add_timeline_entry({
      thread_id,
      user_base_directory,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'error',
        error_type: 'tool_execution_error',
        message: error_message,
        content: {
          tool_name,
          tool_parameters,
          error: error.message
        }
      }
    })

    return {
      success: false,
      error: error_message
    }
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

  try {
    const reader = structured_stream.getReader()

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
  }

  return { text: full_response, tool_calls }
}

/**
 * Make an inference request to the provider
 *
 * @param {Object} params Inference request parameters
 * @param {Object} params.thread Thread object
 * @param {string} params.prompt Prompt text
 * @param {string} params.user_base_directory User base directory
 * @param {Function} params.on_text Callback for text updates
 * @param {Function} params.on_tool_call Callback for tool calls
 * @returns {Promise<Object>} Response from the inference
 */
const make_inference_request = async ({
  thread,
  prompt,
  user_base_directory,
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
      user_base_directory,
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
      user_base_directory,
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
      user_base_directory,
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
 * @param {string} params.user_base_directory User base directory
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
  user_base_directory,
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
        user_base_directory,
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
        user_base_directory,
        thread_state: 'paused',
        reason: 'Maximum iterations reached in continuous execution'
      })

      break
    }

    try {
      // Execute single iteration
      last_result = await execute_single_iteration({
        thread_id,
        user_base_directory,
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
  user_base_directory,
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
      thread_id,
      user_base_directory
    })

    // Register workflow tools if this thread has a workflow
    if (thread.workflow_base_relative_path) {
      const { register_workflow_tools } = await import(
        '#libs-server/workflow/index.mjs'
      )
      await register_workflow_tools({
        workflow_base_relative_path: thread.workflow_base_relative_path,
        root_base_directory: user_base_directory.split('/user')[0] // Extract root from user base
      })
    }

    // Generate prompt
    const prompt_data = await generate_prompt({
      thread_id,
      user_base_directory
    })

    // Update thread state to active if not already
    if (thread.thread_state !== 'active') {
      await update_thread_state({
        thread_id,
        user_base_directory,
        thread_state: 'active'
      })

      // Add timeline entry for state change
      await add_timeline_entry({
        thread_id,
        user_base_directory,
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

    console.log(prompt_data.prompt_text)

    // Make inference request
    const response = await make_inference_request({
      thread,
      prompt: prompt_data.prompt_text,
      user_base_directory,
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
              tool_call,
              user_base_directory
            })

            on_tool_result(result)

            // If this is a workflow completion tool, update thread state
            if (result.success && result.result?.stops_execution) {
              log(`Workflow tool ${tool_call.tool_name} completed execution`)

              // Update thread state to completed if it's a workflow completion
              await update_thread_state({
                thread_id: thread.thread_id,
                user_base_directory,
                thread_state: 'completed',
                reason: `Workflow completed via ${tool_call.tool_name} tool`
              })
            }
          }

          // Break after first blocking tool
          break
        }

        // Process non-blocking tool calls if auto-executing
        if (auto_execute_tools) {
          const result = await process_tool_call({
            thread,
            tool_call,
            user_base_directory
          })

          on_tool_result(result)
        }
      }
    }

    // Call completion callback
    on_completion({
      thread_id,
      blocking_tool_encountered,
      execution_stopping_tool,
      response,
      iteration_count
    })

    return {
      thread_id,
      blocking_tool_encountered,
      execution_stopping_tool,
      response
    }
  } catch (error) {
    log(`Error executing thread iteration: ${error.message}`)

    // Add timeline entry for error
    await add_timeline_entry({
      thread_id,
      user_base_directory,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'error',
        error_type: 'thread_execution_error',
        message: `Thread execution failed: ${error.message}`,
        content: {
          error: error.message,
          iteration: iteration_count
        }
      }
    })

    throw error
  }
}

export default execute_thread
