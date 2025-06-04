#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import chalk from 'chalk'

import { isMain } from '#libs-server'
import config from '#config'
import { create_thread, get_thread } from '#libs-server/threads/index.mjs'
import generate_prompt from '#libs-server/threads/generate-prompt.mjs'
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
 * Create a new thread
 * @param {Object} params Thread creation parameters
 * @returns {Promise<Object>} Created thread
 */
const create_new_thread = async ({
  user_id,
  inference_provider,
  model,
  thread_main_request,
  user_base_directory,
  tools
}) => {
  try {
    const thread = await create_thread({
      user_id,
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
 * Process the streaming response from a provider
 * @param {ReadableStream} structured_stream Stream with structured data
 * @returns {Promise<Object>} Final response data
 */
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
            process.stdout.write(new_formatted_text)
          }
          formatted_response = value.formatted_text
        } else {
          process.stdout.write(value.text)
        }
      }

      // Process tool calls if present
      if (value.tool_calls && value.tool_calls.length > 0) {
        for (const tool_call of value.tool_calls) {
          // Create a unique ID for the tool call based on name and params
          const tool_call_id = `${tool_call.tool_name}:${JSON.stringify(tool_call.tool_params)}`

          // Only process this tool call if we haven't seen it before
          if (!processed_tool_call_ids.has(tool_call_id)) {
            console.log(chalk.magenta(`\n\n[Tool Call] ${tool_call.tool_name}`))
            console.log(
              chalk.cyan(JSON.stringify(tool_call.tool_params, null, 2))
            )
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

/**
 * Make a direct inference request
 * @param {Object} params Inference request parameters
 * @returns {Promise<Object>} Response data
 */
const make_inference_request = async ({
  provider_name,
  model,
  prompt,
  options = {}
}) => {
  try {
    log(`Making inference request to ${provider_name} using model ${model}`)
    console.log(chalk.cyan('\n--- Making Inference Request ---'))
    console.log(`Provider: ${chalk.yellow(provider_name)}`)
    console.log(`Model: ${chalk.yellow(model)}`)
    console.log(`Prompt length: ${chalk.yellow(prompt.length)} characters`)

    const provider_options = options
    const provider = get_provider(provider_name)

    // Setup response container
    let response_data = { text: '', tool_calls: [] }

    console.log(chalk.cyan('\n--- Response ---'))

    // Try streaming request with the new interface
    const response_stream = await provider.generate_stream({
      model,
      prompt,
      options: provider_options
    })

    response_data = await process_stream(response_stream)

    console.log(chalk.cyan('\n\n--- End of Response ---\n'))
    return response_data
  } catch (error) {
    log('Inference request error:', error)
    console.error(chalk.red(`Inference request failed: ${error.message}`))
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
    .option('options', {
      alias: 'o',
      type: 'string',
      description:
        'JSON string of model options (e.g. \'{"temperature": 0.7}\')',
      default: '{}'
    })
    .check((argv) => {
      if (!argv['thread-id'] && !argv.request) {
        throw new Error('Either --thread-id (-t) or --request (-r) is required')
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
  } else {
    // Create new thread
    const thread_main_request = argv.request || ''

    thread = await create_new_thread({
      user_id: argv['user-id'],
      inference_provider: argv.provider,
      model: argv.model,
      thread_main_request,
      user_base_directory
    })
  }

  // Generate and output prompt
  const prompt_data = await output_prompt({
    thread_id: thread.thread_id,
    user_base_directory
  })

  // Make a direct inference request if requested
  if (argv.inference) {
    let options = {}
    try {
      options = JSON.parse(argv.options)
    } catch (e) {
      log('Options parsing error:', e)
      console.error(chalk.yellow(`Failed to parse options JSON: ${e.message}`))
      console.error(chalk.yellow('Using default options instead'))
    }

    await make_inference_request({
      provider_name: argv.provider,
      model: argv.model,
      prompt: prompt_data.prompt_text,
      options
    })
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
