import express from 'express'
import debug from 'debug'

import * as threads from '#libs-server/threads/index.mjs'
import * as inference_providers from '#libs-server/inference-providers/index.mjs'
import { has_tool } from '#libs-server/tools/registry.mjs'

const router = express.Router()
const log = debug('api:threads')

/**
 * Handle errors consistently
 */
function handle_errors(res, error, operation) {
  log(`Error ${operation}: ${error.message}`)
  res.status(500).json({
    error: `Failed to ${operation}`,
    message: error.message
  })
}

// Get all threads with optional filtering
router.get('/', async (req, res) => {
  try {
    const { user_public_key, thread_state } = req.query
    const limit = parseInt(req.query.limit) || 1000
    const offset = parseInt(req.query.offset) || 0

    // Use provided public key or default to null for all users
    const query_user_public_key = user_public_key

    const thread_list = await threads.list_threads({
      user_public_key: query_user_public_key,
      thread_state,
      limit,
      offset
    })

    res.json(thread_list)
  } catch (error) {
    handle_errors(res, error, 'listing threads')
  }
})

// Get a specific thread
router.get('/:thread_id', async (req, res) => {
  try {
    log(`Getting thread ${req.params.thread_id}`)
    const { thread_id } = req.params

    const thread = await threads.get_thread({
      thread_id
    })

    log(`Thread retrieved successfully: ${thread.thread_id}`)
    res.json(thread)
  } catch (error) {
    log(`Error getting thread: ${error.message}`)
    if (error.message.includes('Thread not found')) {
      return res.status(404).json({ error: 'Thread not found' })
    }
    handle_errors(res, error, 'getting thread')
  }
})

// Create a new thread
router.post('/', async (req, res) => {
  try {
    const {
      user_public_key,
      inference_provider,
      model,
      thread_main_request,
      tools,
      thread_state,
      create_git_branches = true
    } = req.body

    // Validate required fields
    if (!inference_provider) {
      return res.status(400).json({ error: 'inference_provider is required' })
    }

    if (!model) {
      return res.status(400).json({ error: 'model is required' })
    }

    // Create the thread
    if (!user_public_key && !req.auth?.user_public_key) {
      return res.status(400).json({ error: 'user_public_key is required' })
    }

    const thread = await threads.create_thread({
      user_public_key: user_public_key || req.auth?.user_public_key,
      inference_provider,
      model,
      thread_main_request,
      tools,
      thread_state,
      create_git_branches
    })

    res.status(201).json(thread)
  } catch (error) {
    handle_errors(res, error, 'creating thread')
  }
})

// Add a message to a thread
router.post('/:thread_id/messages', async (req, res) => {
  try {
    const { thread_id } = req.params
    const { content, generate_response = true, stream = false } = req.body

    if (!content) {
      return res.status(400).json({ error: 'message content is required' })
    }

    // Get the thread first to access its properties
    let thread
    try {
      thread = await threads.get_thread({ thread_id })
    } catch (error) {
      if (error.message && error.message.includes('Thread not found')) {
        return res.status(404).json({ error: 'Thread not found' })
      }
      throw error
    }

    // Add user message
    let updated_thread = await threads.add_user_message({
      thread_id,
      content
    })

    // If generate_response is true, generate an AI response
    if (generate_response) {
      try {
        // Get the provider
        const provider = inference_providers.get_provider(
          thread.inference_provider
        )

        // Format messages for the provider
        const messages = updated_thread.timeline
          .filter((entry) => entry.type === 'message')
          .map((entry) => ({
            role: entry.role,
            content: entry.content
          }))

        if (stream) {
          // Streaming response not implemented in this version
          // This would require setting up SSE or WebSockets
          return res
            .status(501)
            .json({ error: 'Streaming responses not yet implemented' })
        } else {
          // Generate response
          const response = await provider.generate_message({
            thread_id,
            messages,
            model: thread.model
          })

          // Add assistant message to timeline
          updated_thread = await threads.add_assistant_message({
            thread_id,
            content: response.message.content
          })
        }
      } catch (error) {
        log('Error generating response:', error)

        // Add error entry to timeline
        await threads.add_error({
          thread_id,
          error_type: 'generate_response_failed',
          message: error.message,
          details: { stack: error.stack }
        })

        // Re-fetch the thread to include the error entry
        updated_thread = await threads.get_thread({
          thread_id
        })
      }
    }

    res.json(updated_thread)
  } catch (error) {
    handle_errors(res, error, 'adding message')
  }
})

// Update thread state
router.put('/:thread_id/state', async (req, res) => {
  try {
    const { thread_id } = req.params
    const { thread_state, reason } = req.body

    if (!thread_state) {
      return res.status(400).json({ error: 'thread_state is required' })
    }

    // Update thread state
    const updated_thread = await threads.update_thread_state({
      thread_id,
      thread_state,
      reason
    })

    res.json(updated_thread)
  } catch (error) {
    handle_errors(res, error, 'updating thread state')
  }
})

// Execute a tool called by the model
router.post('/:thread_id/execute-tool', async (req, res) => {
  try {
    const { thread_id } = req.params
    const { tool_name, parameters } = req.body

    if (!tool_name) {
      return res.status(400).json({ error: 'tool_name is required' })
    }

    if (!parameters) {
      return res.status(400).json({ error: 'parameters is required' })
    }

    // Get the thread to check tools
    const thread = await threads.get_thread({ thread_id })

    // Check if the tool is allowed for this thread
    if (thread.tools && !thread.tools.includes(tool_name)) {
      return res
        .status(400)
        .json({ error: `Tool '${tool_name}' is not allowed for this thread` })
    }

    // Check if the tool exists
    if (!has_tool({ tool_name })) {
      return res
        .status(400)
        .json({ error: `Tool '${tool_name}' is not registered` })
    }

    // Add tool call to timeline
    const updated_thread = await threads.add_tool_call({
      thread_id,
      tool_name,
      parameters
    })

    res.json(updated_thread)
  } catch (error) {
    handle_errors(res, error, 'executing tool')
  }
})

// Execute a thread
router.post('/:thread_id/execute', async (req, res) => {
  try {
    const { thread_id } = req.params
    const {
      auto_execute_tools = true,
      continuous = false,
      max_iterations = 50
    } = req.body

    // Execute the thread
    const result = await threads.execute_thread({
      thread_id,
      auto_execute_tools,
      continuous,
      max_iterations,
      on_text: (text) => {
        // In a real implementation, this could stream text via WebSocket
        log(`Thread ${thread_id} text: ${text}`)
      },
      on_tool_call: (tool_call) => {
        log(`Thread ${thread_id} tool call: ${tool_call.tool_name}`)
      },
      on_tool_result: (tool_call, result) => {
        log(`Thread ${thread_id} tool result: ${result.success}`)
      },
      on_completion: (completion) => {
        log(`Thread ${thread_id} completion: ${completion.text}`)
      }
    })

    res.json(result)
  } catch (error) {
    handle_errors(res, error, 'executing thread')
  }
})

export default router
