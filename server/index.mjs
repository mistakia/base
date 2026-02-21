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
import health_router from '#server/routes/health.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { create_render_html_middleware } from '#server/middleware/render-html.mjs'
import {
  create_auth_limiter,
  create_search_limiter,
  create_write_limiter,
  create_read_limiter
} from '#server/middleware/rate-limiter.mjs'

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
api.use(
  compression({
    // Compression level 6 balances speed and compression ratio
    // Higher levels (7-9) offer marginally better compression but significantly slower
    level: 6,
    // Compress responses larger than 1KB (default)
    threshold: 1024,
    // Custom filter to ensure large JSON responses are always compressed
    filter: (req, res) => {
      const content_type = res.getHeader('Content-Type')
      // Always compress JSON responses (handles large thread timelines)
      if (content_type && content_type.includes('application/json')) {
        return true
      }
      // Fall back to default compression filter for other content types
      return compression.filter(req, res)
    }
  })
)

// Add security headers for SPA
api.use((req, res, next) => {
  // Security headers - defense in depth
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // Content Security Policy - restrict resource loading
  // Note: 'unsafe-inline' and 'unsafe-eval' may be needed for some SPAs
  // Adjust based on actual application requirements
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss:"
  )

  // HSTS - enforce HTTPS (1 year)
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )

  // Referrer Policy - limit referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

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
  'http://localhost:8080',
  'https://localhost:8080',
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

// Health endpoint - registered before auth middleware so it works without authentication
api.use('/api/health', health_router)

// JWT parsing middleware for all routes - parses tokens but doesn't block
api.use(parse_jwt_token())

// Create rate limiters
const auth_limiter = create_auth_limiter()
const search_limiter = create_search_limiter()
const write_limiter = create_write_limiter()
const read_limiter = create_read_limiter()

// Register API routes with appropriate rate limiters
// Auth endpoints - strictest limits (10 req/min)
api.use('/api/users', auth_limiter, routes.users)

// Search endpoints - moderate limits (30 req/min)
api.use('/api/search', search_limiter, routes.search)

// Write-heavy endpoints - write limits (60 req/min)
api.use('/api/threads', write_limiter, routes.threads)
api.use('/api/tasks', write_limiter, routes.tasks)
api.use('/api/entities', write_limiter, routes.entities)

// Read-heavy endpoints - generous limits (300 req/min)
api.use('/api/tags', read_limiter, routes.tags)
api.use('/api/github', read_limiter, routes.github)
api.use('/api/models', read_limiter, routes.models)
api.use('/api/filesystem', read_limiter, routes.filesystem)
api.use('/api/active-sessions', read_limiter, routes.active_sessions)
api.use('/api/activity', read_limiter, routes.activity)
api.use('/api/git', read_limiter, routes.git)

// Transcription endpoint - write limits (handles file upload)
api.use('/api/transcribe', write_limiter, routes.transcribe)

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

    // Parse authentication tokens - JWT only, no spoofable query params
    try {
      const token = parsed.searchParams.get('token')
      if (token) {
        const decoded = await jwt.verify(token, config.jwt.secret)
        request.user = {
          user_public_key: decoded.user_public_key,
          ...decoded
        }
        request.is_authenticated = true
      } else {
        // Anonymous connection - no authentication
        request.user = null
        request.is_authenticated = false
      }
    } catch (authError) {
      log(`WebSocket auth error: ${authError.message}`)
      // Don't destroy the socket for invalid tokens, allow connection without auth
      request.user = null
      request.is_authenticated = false
    }

    // Handle the WebSocket upgrade
    wss.handleUpgrade(request, socket, head, function (ws) {
      ws.is_authenticated = request.is_authenticated || false
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
