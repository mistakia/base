import express from 'express'
import debug from 'debug'

import * as threads from '#libs-server/threads/index.mjs'
import * as inference_providers from '#libs-server/inference-providers/index.mjs'
import { has_tool } from '#libs-server/tools/registry.mjs'

const router = express.Router()
const log = debug('api:threads')

/**
 * Middleware for authentication check
 */
const require_auth = (req, res, next) => {
  if (!req.auth?.user_id) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

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

/**
 * Middleware to check thread ownership
 */
async function check_thread_ownership(req, res, next) {
  try {
    const { thread_id } = req.params

    // Get the thread
    const thread = await threads.get_thread({
      thread_id
    })

    // Check if the authenticated user owns this thread
    if (thread.user_id !== req.auth.user_id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to access this thread' })
    }

    // Attach thread to request for use in route handlers
    req.thread = thread

    next()
  } catch (error) {
    if (error.message.includes('Thread not found')) {
      return res.status(404).json({ error: 'Thread not found' })
    }
    handle_errors(res, error, 'checking thread ownership')
  }
}

// Get all threads with optional filtering
router.get('/', require_auth, async (req, res) => {
  try {
    const { user_id, thread_state } = req.query
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0

    // Default to the authenticated user if no user_id is provided
    const query_user_id = user_id || req.auth.user_id

    // Check if user is authorized to view these threads
    if (query_user_id !== req.auth.user_id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view these threads' })
    }

    const thread_list = await threads.list_threads({
      user_id: query_user_id,
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
router.get(
  '/:thread_id',
  require_auth,
  check_thread_ownership,
  async (req, res) => {
    // Thread is already validated and available as req.thread
    res.json(req.thread)
  }
)

// Create a new thread
router.post('/', require_auth, async (req, res) => {
  try {
    const {
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
    const thread = await threads.create_thread({
      user_id: req.auth.user_id,
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
router.post(
  '/:thread_id/messages',
  require_auth,
  check_thread_ownership,
  async (req, res) => {
    try {
      const { thread_id } = req.params
      const { content, generate_response = true, stream = false } = req.body

      if (!content) {
        return res.status(400).json({ error: 'message content is required' })
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
            req.thread.inference_provider
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
              model: req.thread.model
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
  }
)

// Update thread state
router.put(
  '/:thread_id/state',
  require_auth,
  check_thread_ownership,
  async (req, res) => {
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
  }
)

// Execute a tool called by the model
router.post(
  '/:thread_id/execute-tool',
  require_auth,
  check_thread_ownership,
  async (req, res) => {
    try {
      const { thread_id } = req.params
      const { tool_name, parameters } = req.body

      if (!tool_name) {
        return res.status(400).json({ error: 'tool_name is required' })
      }

      if (!parameters) {
        return res.status(400).json({ error: 'parameters is required' })
      }

      // Check if the tool is allowed for this thread
      if (req.thread.tools && !req.thread.tools.includes(tool_name)) {
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
  }
)

// Execute a thread
router.post(
  '/:thread_id/execute',
  require_auth,
  check_thread_ownership,
  async (req, res) => {
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
  }
)

export default router
