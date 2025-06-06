#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import chalk from 'chalk'

import { isMain } from '#libs-server'
import config from '#config'
import {
  create_thread,
  get_thread,
  execute_thread
} from '#libs-server/threads/index.mjs'
import generate_prompt from '#libs-server/threads/generate-prompt.mjs'
import { THREAD_MESSAGE_ROLE } from '#libs-server/threads/threads-constants.mjs'
import OllamaProvider from '#libs-server/inference-providers/ollama.mjs'
import {
  get_provider,
  provider_registry
} from '#libs-server/inference-providers/index.mjs'

const log = debug('agent-playground')
debug.enable('agent-playground')

// Register Ollama provider
provider_registry.register('ollama', new OllamaProvider())

/**
 * Display a thread's timeline entries
 * @param {Object} params Timeline display parameters
 * @returns {Promise<void>}
 */
const display_timeline = async ({
  thread_id,
  user_base_directory,
  limit = 0
}) => {
  try {
    const thread = await get_thread({
      thread_id,
      user_base_directory
    })

    console.log(chalk.cyan('\n--- Thread Timeline ---'))
    console.log(chalk.blue(`Thread ID: ${thread_id}`))
    console.log(chalk.blue(`State: ${thread.thread_state}`))
    console.log(
      chalk.blue(`Created: ${new Date(thread.created_at).toLocaleString()}`)
    )
    console.log(
      chalk.blue(`Updated: ${new Date(thread.updated_at).toLocaleString()}`)
    )
    console.log(
      chalk.blue(
        `Provider: ${thread.inference_provider} / Model: ${thread.model}`
      )
    )
    console.log(chalk.blue(`Timeline entries: ${thread.timeline.length}`))
    console.log(chalk.cyan('------------------------\n'))

    // Get timeline entries to display (most recent first if limit is provided)
    const entries =
      limit > 0
        ? thread.timeline.slice(-limit).reverse()
        : [...thread.timeline].reverse()

    // Display timeline entries
    entries.forEach((entry, index) => {
      const timestamp = new Date(entry.timestamp).toLocaleString()
      let entry_color = chalk.white
      let entry_content = ''

      switch (entry.type) {
        case 'message':
          if (entry.role === THREAD_MESSAGE_ROLE.USER) {
            entry_color = chalk.green
            entry_content = `${entry.role}: ${entry.content.message}`
          } else if (entry.role === THREAD_MESSAGE_ROLE.THREAD_AGENT) {
            entry_color = chalk.yellow
            entry_content = `${entry.role}: ${entry.content.message.substring(0, 100)}${entry.content.message.length > 100 ? '...' : ''}`
          } else if (entry.role === THREAD_MESSAGE_ROLE.SYSTEM) {
            entry_color = chalk.blue
            entry_content = `${entry.role}: ${entry.content.message}`
          } else {
            entry_color = chalk.white
            entry_content = `${entry.role}: ${entry.content.message}`
          }
          break

        case 'tool_call':
          entry_color = chalk.magenta
          entry_content = `Tool call: ${entry.content.tool_name}`
          break

        case 'tool_result':
          entry_color = chalk.cyan
          entry_content = `Tool result: ${entry.content.tool_name} - ${entry.content.result.success ? 'Success' : 'Failed'}`
          break

        case 'state_change':
          entry_color = chalk.blue
          entry_content = `State change: ${entry.content.from_state} → ${entry.content.to_state}${entry.content.reason ? ` (${entry.content.reason})` : ''}`
          break

        case 'error':
          entry_color = chalk.red
          entry_content = `Error (${entry.error_type}): ${entry.message}`
          break

        case 'thread_main_request':
          entry_color = chalk.green
          entry_content = `Main request: ${entry.content}`
          break

        case 'notification':
          entry_color = chalk.yellow
          entry_content = `Notification (${entry.content.level}): ${entry.content.message}`
          break

        case 'human_request':
          entry_color = chalk.magenta
          entry_content = `Human request: ${entry.content.question}`
          break

        default:
          entry_content = JSON.stringify(entry.content)
      }

      console.log(
        entry_color(`[${timestamp}] [${entry.type}] ${entry_content}`)
      )

      // Add a newline between entries for better readability
      if (index < entries.length - 1) {
        console.log()
      }
    })

    console.log(chalk.cyan('\n------------------------\n'))
  } catch (error) {
    console.error(chalk.red(`Failed to display timeline: ${error.message}`))
    throw error
  }
}

/**
 * Create a new thread
 * @param {Object} params Thread creation parameters
 * @returns {Promise<Object>} Created thread
 */
const create_new_thread = async ({
  user_id,
  workflow_base_relative_path,
  inference_provider,
  model,
  thread_main_request,
  user_base_directory,
  tools
}) => {
  try {
    const thread = await create_thread({
      user_id,
      workflow_base_relative_path,
      inference_provider,
      model,
      thread_main_request,
      user_base_directory,
      root_base_directory: config.root_base_directory,
      tools
    })

    log(`Created new thread ${thread.thread_id}`)
    console.log(chalk.green(`\nCreated new thread: ${thread.thread_id}`))

    return thread
  } catch (error) {
    console.error(chalk.red(`Failed to create thread: ${error.message}`))
    throw error
  }
}

/**
 * Load an existing thread
 * @param {Object} params Thread loading parameters
 * @returns {Promise<Object>} Loaded thread
 */
const load_thread = async ({ thread_id, user_base_directory }) => {
  try {
    const thread = await get_thread({
      thread_id,
      user_base_directory
    })
    log(`Loaded thread ${thread_id}`)
    console.log(chalk.green(`\nLoaded thread: ${thread_id}`))

    return thread
  } catch (error) {
    console.error(chalk.red(`Failed to load thread: ${error.message}`))
    throw error
  }
}

/**
 * Generate and output prompt
 * @param {Object} params Prompt generation parameters
 * @returns {Promise<Object>} Generated prompt data
 */
const output_prompt = async ({ thread_id, user_base_directory }) => {
  try {
    const prompt_data = await generate_prompt({
      thread_id,
      user_base_directory
    })

    console.log(chalk.cyan('\n--- Generated Prompt ---'))
    console.log(prompt_data.prompt_text)
    console.log(chalk.cyan('------------------------\n'))

    return prompt_data
  } catch (error) {
    log('Prompt generation error:', error)
    console.error(chalk.red(`Failed to generate prompt: ${error.message}`))
    throw error
  }
}

/**
 * Run the thread execution loop
 * @param {Object} params Thread execution parameters
 * @returns {Promise<Object>} Execution result
 */
const run_thread_execution = async ({
  thread_id,
  user_base_directory,
  auto_execute = true,
  continuous = false,
  max_iterations = 50
}) => {
  console.log(
    chalk.cyan(
      `\n--- Executing Thread${continuous ? ' (Continuous Mode)' : ''} ---`
    )
  )

  try {
    // Setup callbacks for execution events
    const on_text = (text) => {
      process.stdout.write(text)
    }

    const on_tool_call = (tool_call) => {
      console.log(chalk.magenta(`\n\n[Tool Call] ${tool_call.tool_name}`))
      console.log(
        chalk.cyan(JSON.stringify(tool_call.tool_parameters, null, 2))
      )
    }

    const on_tool_result = (result) => {
      console.log(chalk.yellow(`\n[Tool Result] ${result.tool_name}`))
      if (result.success) {
        console.log(chalk.green('Success:'), result.result)
      } else {
        console.log(chalk.red('Error:'), result.error)
      }
    }

    const on_completion = (completion_info) => {
      const {
        blocking_tool_encountered,
        terminate_tool_encountered,
        pause_tool_encountered,
        message_ask_tool_encountered,
        iteration_count
      } = completion_info

      if (continuous && iteration_count) {
        console.log(chalk.gray(`\n[Iteration ${iteration_count}]`))
      }

      if (terminate_tool_encountered) {
        console.log(chalk.green('\n\n--- Thread Terminated ---'))
      } else if (pause_tool_encountered) {
        console.log(chalk.yellow('\n\n--- Thread Paused ---'))
      } else if (message_ask_tool_encountered) {
        console.log(
          chalk.yellow('\n\n--- Thread Paused (Waiting for User Response) ---')
        )
      } else if (blocking_tool_encountered) {
        console.log(chalk.yellow('\n\n--- Thread Paused (Blocking Tool) ---'))
      } else if (!continuous) {
        console.log(chalk.blue('\n\n--- Thread Execution Step Complete ---'))
      }
    }

    // Execute the thread with continuous support
    const result = await execute_thread({
      thread_id,
      user_base_directory,
      on_text,
      on_tool_call,
      on_tool_result,
      on_completion,
      auto_execute_tools: auto_execute,
      continuous,
      max_iterations
    })

    if (continuous) {
      console.log(
        chalk.cyan(
          `\n--- Continuous Execution Complete (${result.iteration_count} iterations) ---\n`
        )
      )
    } else {
      console.log(chalk.cyan('\n--- Thread Execution Complete ---\n'))
    }

    return result
  } catch (error) {
    log('Thread execution error:', error)
    console.error(chalk.red(`Thread execution failed: ${error.message}`))
    throw error
  }
}

/**
 * Main run function
 */
const run = async () => {
  const argv = yargs(hideBin(process.argv))
    .option('thread-id', {
      alias: 't',
      type: 'string',
      description: 'Existing thread ID to load'
    })
    .option('user-id', {
      alias: 'u',
      type: 'string',
      description: 'User ID for the thread',
      default: config.user_id
    })
    .option('provider', {
      alias: 'p',
      type: 'string',
      description: 'Inference provider',
      default: 'ollama'
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      description: 'Model name',
      default: 'maryasov/qwen2.5-coder-cline:32b'
    })
    .option('workflow', {
      alias: 'w',
      type: 'string',
      description:
        'Workflow base relative path (e.g., "user/workflow/generate-daily-schedule.md")'
    })
    .option('request', {
      alias: 'r',
      type: 'string',
      description: 'Main request for the thread'
    })
    .option('directory', {
      alias: 'd',
      type: 'string',
      description: 'Custom user base directory',
      default: config.user_base_directory
    })
    .option('inference', {
      alias: 'i',
      type: 'boolean',
      description: 'Make a direct inference request using the prompt',
      default: false
    })
    .option('execute', {
      alias: 'e',
      type: 'boolean',
      description: 'Execute the thread using the execution loop',
      default: false
    })
    .option('timeline', {
      type: 'boolean',
      description: 'Display the timeline of the thread',
      default: false
    })
    .option('timeline-limit', {
      type: 'number',
      description:
        'Number of most recent timeline entries to display (0 for all)',
      default: 0
    })
    .option('loop', {
      alias: 'l',
      type: 'boolean',
      description:
        'Continue executing the thread until completion or blocking tool',
      default: false
    })
    .option('max-iterations', {
      type: 'number',
      description: 'Maximum number of iterations for continuous execution',
      default: 50
    })
    .option('no-auto', {
      type: 'boolean',
      description: 'Do not auto-execute tools',
      default: false
    })
    .option('options', {
      alias: 'o',
      type: 'string',
      description:
        'JSON string of model options (e.g. \'{"temperature": 0.7}\')',
      default: '{}'
    })
    .check((argv) => {
      if (
        !argv['thread-id'] &&
        !argv.request &&
        !argv.timeline &&
        !argv.workflow
      ) {
        throw new Error(
          'Either --thread-id (-t), --request (-r), --workflow (-w), or --timeline is required'
        )
      }
      return true
    })
    .help()
    .alias('help', 'h').argv

  const user_base_directory = argv.directory
  let thread

  if (argv['thread-id']) {
    // Load existing thread
    thread = await load_thread({
      thread_id: argv['thread-id'],
      user_base_directory
    })
  } else if (!argv.timeline) {
    // Create new thread if not just viewing timeline
    const thread_main_request = argv.request || ''

    thread = await create_new_thread({
      user_id: argv['user-id'],
      workflow_base_relative_path: argv.workflow,
      inference_provider: argv.provider,
      model: argv.model,
      thread_main_request,
      user_base_directory
    })
  }

  // Display timeline if requested
  if (argv.timeline && thread) {
    await display_timeline({
      thread_id: thread.thread_id,
      user_base_directory,
      limit: argv['timeline-limit']
    })
    return
  }

  // Generate and output prompt if not just viewing timeline
  if (!argv.timeline) {
    const prompt_data = await output_prompt({
      thread_id: thread.thread_id,
      user_base_directory
    })

    // Execute the thread if requested
    if (argv.execute) {
      const auto_execute = !argv['no-auto']
      const continuous = argv.loop
      const max_iterations = argv['max-iterations']

      // Execute the thread (either single step or continuous)
      await run_thread_execution({
        thread_id: thread.thread_id,
        user_base_directory,
        auto_execute,
        continuous,
        max_iterations
      })

      // Display timeline after execution
      await display_timeline({
        thread_id: thread.thread_id,
        user_base_directory,
        limit: argv['timeline-limit']
      })
    }
    // Make a direct inference request if requested
    else if (argv.inference) {
      let options = {}
      try {
        options = JSON.parse(argv.options)
      } catch (e) {
        log('Options parsing error:', e)
        console.error(
          chalk.yellow(`Failed to parse options JSON: ${e.message}`)
        )
        console.error(chalk.yellow('Using default options instead'))
      }

      // Setup for processing the stream directly
      const on_text = (text) => process.stdout.write(text)
      const on_tool_call = (tool_call) => {
        console.log(chalk.magenta(`\n\n[Tool Call] ${tool_call.tool_name}`))
        console.log(
          chalk.cyan(JSON.stringify(tool_call.tool_parameters, null, 2))
        )
      }

      const provider = get_provider(argv.provider)
      const response_stream = await provider.generate_stream({
        model: argv.model,
        prompt: prompt_data.prompt_text,
        options
      })

      // Process stream
      const process_stream = async (structured_stream) => {
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
          console.error(
            chalk.yellow(`\nStream processing interrupted: ${error.message}`)
          )
        }

        return { text: full_response, tool_calls }
      }

      await process_stream(response_stream)
      console.log(chalk.cyan('\n\n--- End of Response ---\n'))
    }
  }
}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    log('Fatal error:', err)
    console.error(chalk.red(`Error: ${error.message}`))
  } finally {
    process.exit(error ? 1 : 0)
  }
}

if (isMain(import.meta.url)) {
  main()
}
