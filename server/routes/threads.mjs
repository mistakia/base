import express from 'express'
import debug from 'debug'
import { threads, inference_providers } from '#libs-server'
import {
  execute_tool,
  has_tool,
  list_tools
} from '#libs-server/tools/index.mjs'

const router = express.Router()
const log = debug('api:threads')

// Middleware for authentication check
const require_auth = (req, res, next) => {
  if (!req.auth?.user_id) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

// Middleware to check thread ownership
const check_thread_ownership = async (req, res, next) => {
  try {
    const { thread_id } = req.params
    const user_base_directory =
      req.body?.user_base_directory || req.query?.user_base_directory

    const thread = await threads.get_thread({ thread_id, user_base_directory })

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' })
    }

    if (thread.user_id !== req.auth.user_id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to access this thread' })
    }

    // Add thread to request for use in route handlers
    req.thread = thread
    next()
  } catch (error) {
    log('Error checking thread ownership: %o', error)

    // Handle thread not found errors specifically
    if (error.message && error.message.includes('Thread not found')) {
      return res.status(404).json({ error: 'Thread not found' })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
}

// Helper to handle common errors
const handle_errors = (res, error, action) => {
  log(`Error ${action}: %o`, error)

  // Check if this is a thread not found error
  if (error.message && error.message.includes('Thread not found')) {
    return res.status(404).json({
      error: 'Thread not found',
      message: error.message
    })
  }

  res.status(500).json({
    error: `Error ${action}`,
    message: error.message
  })
}

// Get all threads with optional filtering
router.get('/', require_auth, async (req, res) => {
  try {
    const { user_id, state } = req.query
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    const user_base_directory = req.query.user_base_directory

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
      state,
      limit,
      offset,
      user_base_directory
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
      state,
      user_base_directory,
      root_base_directory
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
      state,
      user_base_directory,
      root_base_directory
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
      const {
        content,
        generate_response = true,
        stream = false,
        user_base_directory
      } = req.body

      if (!content) {
        return res.status(400).json({ error: 'message content is required' })
      }

      // Add user message
      let updated_thread = await threads.add_user_message({
        thread_id,
        content,
        user_base_directory
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
              content: response.message.content,
              user_base_directory
            })
          }
        } catch (error) {
          log('Error generating response:', error)

          // Add error entry to timeline
          await threads.add_error({
            thread_id,
            error_type: 'generate_response_failed',
            message: error.message,
            details: { stack: error.stack },
            user_base_directory
          })

          // Re-fetch the thread to include the error entry
          updated_thread = await threads.get_thread({
            thread_id,
            user_base_directory
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
      const { state, reason, user_base_directory } = req.body

      if (!state) {
        return res.status(400).json({ error: 'state is required' })
      }

      // Update thread state
      const updated_thread = await threads.update_thread_state({
        thread_id,
        state,
        reason,
        user_base_directory
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
      const { tool_name, parameters, user_base_directory } = req.body

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
        parameters,
        user_base_directory
      })

      // Get the tool call ID from the last entry
      const tool_call =
        updated_thread.timeline[updated_thread.timeline.length - 1]

      // Execute the tool
      const result = await execute_tool({
        tool_name,
        parameters,
        thread_id,
        context: { user_id: req.auth.user_id },
        user_base_directory
      })

      // Add tool result to timeline
      const result_thread = await threads.add_tool_result({
        thread_id,
        tool_call_id: tool_call.id,
        result,
        user_base_directory
      })

      res.json(result_thread)
    } catch (error) {
      handle_errors(res, error, 'executing tool')
    }
  }
)

// List available thread tools
router.get('/tools', require_auth, async (req, res) => {
  try {
    const available_tools = list_tools()
    res.json(available_tools)
  } catch (error) {
    handle_errors(res, error, 'listing tools')
  }
})

export default router
