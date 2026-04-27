import https from 'https'
import http from 'http'
import fs, { promises as fsPromises } from 'fs'
import url, { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import express from 'express'
import expressStaticGzip from 'express-static-gzip'
import compression from 'compression'
import extend from 'deep-extend'
import debug from 'debug'
import bodyParser from 'body-parser'
import cookie_parser from 'cookie-parser'
import cors from 'cors'
import qs from 'qs'
import jwt from 'jsonwebtoken'

import wss from '#server/websocket.mjs'
import config from '#config'
import routes from '#server/routes/index.mjs'
import health_router from '#server/routes/health.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { create_render_html_middleware } from '#server/middleware/render-html.mjs'
import { create_raw_file_middleware } from '#server/middleware/raw-file.mjs'
import {
  create_auth_limiter,
  create_search_limiter,
  create_write_limiter,
  create_read_limiter
} from '#server/middleware/rate-limiter.mjs'
import { get_all_with_metadata } from '#libs-server/extension/capability-registry.mjs'

const IS_DEV = process.env.NODE_ENV === 'development'
const defaults = {}
const options = extend(defaults, config)
const log = debug('api')
const extension_log = debug('api:extensions')
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
  const frame_src = IS_DEV
    ? 'http://localhost:8080 http://localhost:8081'
    : "'self'"
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss:; frame-src ${frame_src}`
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
const allowedOrigins = new Set([
  config.public_url || '',
  'http://localhost:8080',
  'https://localhost:8080',
  'http://localhost:8081',
  'https://localhost:8081',
  ...(config.cors_origins || [])
])

// Permissive CORS for raw file requests (cross-origin agent access)
const raw_cors = cors({ origin: '*', methods: ['GET', 'OPTIONS'] })
api.use('/raw', raw_cors)
api.use((req, res, next) => {
  if (req.query.raw === 'true') return raw_cors(req, res, next)
  next()
})

const restricted_cors = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)

    if (!allowedOrigins.has(origin)) {
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

// Skip restricted CORS for raw file requests (already handled above)
api.use((req, res, next) => {
  if (req.path.startsWith('/raw/') || req.query.raw === 'true') return next()
  return restricted_cors(req, res, next)
})

// Health endpoint - registered before auth middleware so it works without authentication
api.use('/api/health', health_router)

// Cookie parser - populates req.cookies for JWT cookie fallback
api.use(cookie_parser())

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
api.use('/api/threads', write_limiter, routes.threads_lease)
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

// Job tracker endpoint - write limiter (POST report handles API key internally)
api.use('/api/jobs', write_limiter, routes.jobs)

// Finance API proxy - forwards requests to finance service
api.use('/api/proxy/finance', read_limiter, routes.finance)

// Physical items - read-heavy, no writes
api.use('/api/physical-items', read_limiter, routes.physical_items)

// Stats snapshots and time series
api.use('/api/stats', read_limiter, routes.stats)

// Share link resolution - read-only, public-facing
api.use('/s', read_limiter, routes.share)

// Storage file serving - opt-in via config.storage.enabled. The route is
// default-deny via the rule engine even when enabled; an explicit allow rule
// in role/storage-reader.md is required for any path to return 200.
if (config.storage && config.storage.enabled) {
  api.use('/api/storage', read_limiter, routes.storage)
  console.log(
    `[storage] enabled (root_dir=${config.storage.root_dir || '(unset)'})`
  )
} else {
  console.log('[storage] disabled')
}

// Extension routes placeholder - populated by mount_extension_routes() after
// load_extension_providers() runs. Registered here so extension routes fall
// between built-in routes and the error handler / SPA fallback.
const extension_router = express.Router()
api.use(extension_router)

export function mount_extension_routes() {
  // Reset router layers so repeated calls (e.g. in tests) are idempotent.
  extension_router.stack = []

  const entries = get_all_with_metadata('http-route')
  if (entries.length === 0) {
    return { mounted: 0, providers: 0 }
  }

  const limiters = {
    auth: create_auth_limiter(),
    search: create_search_limiter(),
    write: create_write_limiter(),
    read: create_read_limiter()
  }

  let mounted = 0
  for (const { extension_name, module: provider } of entries) {
    const route_list = Array.isArray(provider.routes) ? provider.routes : []
    for (const descriptor of route_list) {
      const { mount_path, rate_limit_tier, router } = descriptor || {}
      if (typeof mount_path !== 'string' || !mount_path.startsWith('/api/')) {
        extension_log(
          'Extension %s route mount_path %o does not start with /api/, skipping',
          extension_name,
          mount_path
        )
        continue
      }
      if (!router) {
        extension_log(
          'Extension %s route %s missing router, skipping',
          extension_name,
          mount_path
        )
        continue
      }
      const tier = rate_limit_tier || 'read'
      const limiter = limiters[tier]
      if (!limiter) {
        extension_log(
          'Extension %s route %s has invalid rate_limit_tier %o, skipping',
          extension_name,
          mount_path,
          rate_limit_tier
        )
        continue
      }
      extension_router.use(mount_path, limiter, router)
      extension_log(
        'Mounted extension route: extension=%s mount_path=%s tier=%s',
        extension_name,
        mount_path,
        tier
      )
      mounted += 1
    }
  }
  return { mounted, providers: entries.length }
}

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

// Static hosting for base.tint.space distribution content (install script, binaries, system content)
if (config.hosting?.enabled && config.hosting?.static_dir) {
  const hosting_dir = config.hosting.static_dir
  if (fs.existsSync(hosting_dir)) {
    api.use((req, res, next) => {
      // Skip .md files so they fall through to the SPA renderer for entity page views
      // Raw markdown access is still available via /raw/ prefix or ?raw=true
      if (req.path.endsWith('.md')) {
        return next()
      }
      express.static(hosting_dir, {
        maxAge: '1h',
        fallthrough: true
      })(req, res, next)
    })
    log(`Hosting static files from ${hosting_dir}`)
  }
}

// Raw file serving middleware (before SPA fallback)
const raw_file = create_raw_file_middleware()

if (IS_DEV) {
  api.use(raw_file)
  api.get('{*splat}', (req, res) => {
    res.redirect(307, `http://localhost:8081${req.path}`)
  })
} else {
  const build_path = path.join(__dirname, '..', 'build')
  const static_path = path.join(__dirname, '..', 'static')

  // Serve built assets with long-term caching (Brotli > gzip > uncompressed)
  api.use(
    '/build',
    expressStaticGzip(build_path, {
      enableBrotli: true,
      orderPreference: ['br', 'gz'],
      serveStatic: {
        maxAge: '1y',
        immutable: true,
        fallthrough: true
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

  // Raw file serving (after static assets, before SPA fallback)
  api.use(raw_file)

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
    // Reject unauthenticated connections to prevent resource existence probing
    try {
      const token = parsed.searchParams.get('token')
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      const decoded = await jwt.verify(token, config.jwt.secret)
      request.user = {
        user_public_key: decoded.user_public_key,
        ...decoded
      }
      request.is_authenticated = true
    } catch (authError) {
      log(`WebSocket auth error: ${authError.message}`)
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
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

// Periodic missed job check (opt-in via config)
if (
  config.job_tracker?.enabled &&
  config.job_tracker?.path &&
  config.job_tracker?.run_missed_check
) {
  const { check_missed_jobs } =
    await import('#libs-server/jobs/check-missed-jobs.mjs')
  const interval_ms = config.job_tracker.missed_check_interval_ms || 300000
  setInterval(async () => {
    try {
      await check_missed_jobs()
    } catch (error) {
      log('Missed job check error: %s', error.message)
    }
  }, interval_ms)
  log('Missed job check scheduled every %dms', interval_ms)
}

export default server
