import https from 'https'
import http from 'http'
import fs, { promises as fsPromises } from 'fs'
import url, { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import express from 'express'
import compression from 'compression'
import extend from 'deep-extend'
import debug from 'debug'
import bodyParser from 'body-parser'
import cors from 'cors'
import qs from 'qs'
import jwt from 'jsonwebtoken'

import wss from '#server/websocket.mjs'
import config from '#config'
import routes from '#server/routes/index.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { create_render_html_middleware } from '#server/middleware/render-html.mjs'

const IS_DEV = process.env.NODE_ENV === 'development'
const defaults = {}
const options = extend(defaults, config)
const log = debug('api')
const api = express()
const __dirname = dirname(fileURLToPath(import.meta.url))

api.set('query parser', function (str) {
  return qs.parse(str, { arrayLimit: 1000 })
})

api.locals.log = log

api.disable('x-powered-by')
api.use(compression())

// Add security headers for SPA
api.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // SPA-specific headers
  res.setHeader('Cache-Control', 'public, max-age=0')

  next()
})

api.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      // Store raw body for GitHub webhook signature verification
      if (req.url === '/api/github/webhooks') {
        req.raw_body = buf
      }
    }
  })
)
const allowedOrigins = [
  config.public_url || '',
  'http://localhost:8081',
  'https://localhost:8081',
  'http://192.168.1.21:8081',
  'https://192.168.1.21:8081'
]

api.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true)

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          'The CORS policy for this site does not allow access from the specified Origin.'
        return callback(new Error(msg), false)
      }
      return callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

// JWT parsing middleware for all routes - parses tokens but doesn't block
api.use(parse_jwt_token())

// Register other API routes
api.use('/api/threads', routes.threads)
api.use('/api/users', routes.users)
api.use('/api/tasks', routes.tasks)
api.use('/api/tags', routes.tags)
api.use('/api/github', routes.github)
api.use('/api/models', routes.models)
api.use('/api/filesystem', routes.filesystem)
api.use('/api/active-sessions', routes.active_sessions)
api.use('/api/activity', routes.activity)
api.use('/api/entities', routes.entities)

// General error handler
api.use((err, req, res, next) => {
  log(`Error: ${err.name} - ${err.message}`)
  log(`Request path: ${req.path}`)
  log(`Request method: ${req.method}`)
  log(`User agent: ${req.get('User-Agent')}`)

  // Handle different types of errors
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    })
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details
    })
  }

  // Handle other errors as needed
  res.status(500).json({
    error: 'Internal Server Error',
    message: IS_DEV ? err.message : 'Something went wrong',
    ...(IS_DEV && { stack: err.stack })
  })
})

if (IS_DEV) {
  api.get('*', (req, res) => {
    res.redirect(307, `http://localhost:8081${req.path}`)
  })
} else {
  const build_path = path.join(__dirname, '..', 'build')
  const static_path = path.join(__dirname, '..', 'static')

  // Serve built assets with long-term caching
  api.use(
    '/build',
    express.static(build_path, {
      fallthrough: true,
      setHeaders: (res, filepath) => {
        // Set Cache-Control to cache forever for built assets
        res.set('Cache-Control', 'public, max-age=31536000, immutable')
      }
    })
  )

  // Serve static files with medium-term caching
  api.use(
    '/static',
    express.static(static_path, {
      fallthrough: false,
      setHeaders: (res, filepath) => {
        // Set Cache-Control for 7 days for static files
        res.set('Cache-Control', 'public, max-age=604800')
      }
    }),
    (err, req, res, next) => {
      // Error handling middleware for static files
      if (err) {
        res.status(404).send('Static content not found')
      } else {
        next()
      }
    }
  )

  // Create dynamic HTML renderer middleware
  const render_html = create_render_html_middleware({
    base_url: config.production_url
  })

  // Serve assets from build directory only if they exist
  api.use(async (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next()
    }

    const file_path = path.join(build_path, req.path)

    try {
      // Check if the requested file exists in the build directory
      const stats = await fsPromises.stat(file_path)

      if (stats.isFile()) {
        // File exists, serve it with appropriate caching
        const is_asset =
          /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|txt|gz)$/.test(
            req.path
          )

        res.sendFile(file_path, {
          headers: {
            'Cache-Control': is_asset
              ? 'public, max-age=31536000, immutable' // Long cache for assets
              : 'public, max-age=0, must-revalidate' // No cache for HTML
          }
        })
      } else {
        // Not a file (probably a directory), use dynamic HTML rendering for SPA routing
        return render_html(req, res, next)
      }
    } catch (err) {
      // File doesn't exist, use dynamic HTML rendering for client-side routing
      return render_html(req, res, next)
    }
  })
}

const create_server = () => {
  if (!options.ssl) {
    return http.createServer(api)
  }

  const sslOptions = {
    key: fs.readFileSync(config.key),
    cert: fs.readFileSync(config.cert)
  }
  return https.createServer(sslOptions, api)
}

const server = create_server()

server.on('upgrade', async (request, socket, head) => {
  try {
    // Parse URL - this can throw on malformed URLs
    let parsed
    try {
      parsed = new url.URL(request.url, config.public_url)
    } catch (urlError) {
      // Handle malformed URLs from scanners/bots
      log(`Invalid WebSocket upgrade URL: ${request.url}`)
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }

    // Parse authentication tokens
    try {
      const token = parsed.searchParams.get('token')
      if (token) {
        const decoded = await jwt.verify(token, config.jwt.secret)
        request.user = {
          user_public_key: decoded.user_public_key,
          ...decoded
        }
      } else {
        const user_public_key = parsed.searchParams.get('user_public_key')
        if (user_public_key) {
          request.user = { user_public_key }
        }
      }
    } catch (authError) {
      log(`WebSocket auth error: ${authError.message}`)
      // Don't destroy the socket for invalid tokens, allow connection without auth
      request.user = null
    }

    // Handle the WebSocket upgrade
    wss.handleUpgrade(request, socket, head, function (ws) {
      if (request.user && request.user.user_public_key) {
        ws.user_public_key = request.user.user_public_key
        log(`websocket connected with user_public_key: ${ws.user_public_key}`)
      }
      wss.emit('connection', ws, request)
    })
  } catch (error) {
    // Catch-all for any unexpected errors in upgrade handler
    log(`WebSocket upgrade error: ${error.message}`)
    log(error.stack)
    try {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      socket.destroy()
    } catch (destroyError) {
      // Socket may already be closed
      log(`Error destroying socket: ${destroyError.message}`)
    }
  }
})

// Handle client errors (malformed requests, early disconnects, etc.)
server.on('clientError', (error, socket) => {
  log(`Client error: ${error.message}`)

  // Only attempt to send response if socket is still writable
  if (socket.writable && !socket.destroyed) {
    socket.write('HTTP/1.1 400 Bad Request\r\n')
    socket.write('Connection: close\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('\r\n')
  }

  // Destroy the socket to free resources
  socket.destroy()
})

export default server
