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

// General error handler
api.use((err, req, res, next) => {
  log(`Error: ${err.name} - ${err.message}`)
  log(`Request path: ${req.path}`)

  // Handle other errors as needed
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  })
})

if (IS_DEV) {
  api.get('*', (req, res) => {
    res.redirect(307, `http://localhost:8081${req.path}`)
  })
} else {
  const buildPath = path.join(__dirname, '..', 'build')
  api.use('/', async (req, res, next) => {
    const filepath = req.url.replace(/\/$/, '')
    const filename = `${filepath}/index.html`
    const fullpath = path.join(buildPath, filename)
    try {
      const filestat = await fsPromise.stat(fullpath)
      if (filestat.isFile()) {
        return res.sendFile(fullpath, { cacheControl: false })
      }
      next()
    } catch (error) {
      log(error)
      next()
    }
  })
  api.use('/', serveStatic(buildPath))
  api.get('*', (req, res) => {
    const notFoundPath = path.join(__dirname, '../', 'build', '404.html')
    res.sendFile(notFoundPath, { cacheControl: false })
  })

  // redirect to ipfs page
  // res.redirect(307, `${config.url}${req.path}`)
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
