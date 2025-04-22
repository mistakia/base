#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import chalk from 'chalk'

import { isMain } from '#libs-server'
import config from '#config'
import { create_thread, get_thread } from '#libs-server/threads/index.mjs'
import generate_prompt from '#libs-server/threads/generate_prompt.mjs'

const log = debug('agent-playground')
debug.enable('agent-playground')

// Create a new thread
const create_new_thread = async ({
  user_id,
  inference_provider,
  model,
  thread_main_request,
  user_base_directory
}) => {
  try {
    const thread = await create_thread({
      user_id,
      inference_provider,
      model,
      thread_main_request,
      user_base_directory
    })

    log(`Created new thread ${thread.thread_id}`)
    console.log(chalk.green(`\nCreated new thread: ${thread.thread_id}`))

    return thread
  } catch (error) {
    console.error(chalk.red(`Failed to create thread: ${error.message}`))
    throw error
  }
}

// Load an existing thread
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

// Generate and output prompt
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
    console.log(error)
    console.error(chalk.red(`Failed to generate prompt: ${error.message}`))
    throw error
  }
}

// Main run function
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
      default: 'llama2'
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
  await output_prompt({
    thread_id: thread.thread_id,
    user_base_directory
  })
}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.error(chalk.red(`Error: ${error.message}`))
  } finally {
    process.exit(error ? 1 : 0)
  }
}

if (isMain(import.meta.url)) {
  main()
}
