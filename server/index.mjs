import https from 'https'
import http from 'http'
import fs, { promises as fsPromise } from 'fs'
import url, { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import express from 'express'
import compression from 'compression'
import extend from 'deep-extend'
import debug from 'debug'
import bodyParser from 'body-parser'
import cors from 'cors'
import serveStatic from 'serve-static'
import qs from 'qs'
import jwt from 'jsonwebtoken'

import wss from '#server/websocket.mjs'
import config from '#config'
import routes from '#server/routes/index.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { create_permission_middleware } from '#server/middleware/permissions.mjs'

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

// Force HTTPS in production
if (!IS_DEV && options.ssl) {
  api.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`)
    } else {
      next()
    }
  })
}

// Add security headers for SPA
api.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  
  // SPA-specific headers
  res.setHeader('Cache-Control', 'public, max-age=0')
  
  // Enable CORS for SPA
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
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
const allowedOrigins = [config.public_url || '', 'http://localhost:8081']

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
    credentials: true
  })
)

// JWT parsing middleware for all API routes - parses tokens but doesn't block
api.use('/api/*', parse_jwt_token())

// Permission middleware for API routes (after JWT auth)
api.use(
  '/api/*',
  create_permission_middleware({
    exclude_paths: ['/api/users/session', /^\/api\/models(?:\/.*)?$/]
  })
)

// Register other API routes
api.use('/api/threads', routes.threads)
api.use('/api/users', routes.users)
api.use('/api/tags', routes.tags)
// api.use('/api/github', routes.github)
api.use('/api/models', routes.models)
api.use('/api/filesystem', routes.filesystem)

// Health check endpoint
api.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  })
})

// Handle common SPA scenarios
api.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next()
  }
  
  // Handle trailing slashes for better UX
  if (req.path.length > 1 && req.path.endsWith('/')) {
    return res.redirect(301, req.path.slice(0, -1))
  }
  
  // Handle common SPA routing patterns
  if (req.path.includes('.')) {
    // This is likely a file request, let it pass through
    return next()
  }
  
  // Log SPA route requests for debugging
  if (IS_DEV) {
    log(`SPA Route Request: ${req.method} ${req.path}`)
  }
  
  next()
})

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
  const buildPath = path.join(__dirname, '..', 'build')
  
  // Serve static files from build directory with optimized caching
  api.use('/', serveStatic(buildPath, {
    // Enable aggressive caching for static assets
    maxAge: '1y',
    // Don't serve index.html for directory requests
    index: false,
    // Set proper cache headers for different file types
    setHeaders: (res, path) => {
      if (path.endsWith('.js') || path.endsWith('.css')) {
        // Cache JavaScript and CSS files aggressively (they have content hashes)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (path.endsWith('.html')) {
        // Don't cache HTML files
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      } else if (path.match(/\.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
        // Cache images and fonts
        res.setHeader('Cache-Control', 'public, max-age=31536000')
      }
    }
  }))
  
  // SPA fallback: serve index.html for all routes that don't match static files
  // This enables client-side routing to work properly
  api.get('*', (req, res) => {
    const indexPath = path.join(buildPath, 'index.html')
    res.sendFile(indexPath, { 
      cacheControl: false,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
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
  const parsed = new url.URL(request.url, config.url)
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
  } catch (error) {
    log(error)
    // Don't destroy the socket for invalid tokens, allow connection without auth
    request.user = null
  }

  wss.handleUpgrade(request, socket, head, function (ws) {
    if (request.user && request.user.user_public_key) {
      ws.user_public_key = request.user.user_public_key
      log(`websocket connected with user_public_key: ${ws.user_public_key}`)
    }
    wss.emit('connection', ws, request)
  })
})

export default server