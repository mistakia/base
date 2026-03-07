import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import debug from 'debug'
import { extract_meta_data } from '../services/meta-extractor.mjs'
import { generate_script_tags } from '../services/bundle-injector.mjs'
import config from '#config'

const log = debug('server:render-html')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Cache template in memory for performance
let template_cache = null
let template_path = null

/**
 * Load and cache the HTML template
 */
async function load_template() {
  if (!template_path) {
    template_path = path.join(
      __dirname,
      '..',
      'templates',
      'index-template.html'
    )
  }

  try {
    template_cache = await fs.readFile(template_path, 'utf-8')
    log('HTML template loaded successfully')
    return template_cache
  } catch (error) {
    log(`Error loading HTML template from ${template_path}: ${error.message}`)
    throw error
  }
}

/**
 * Replace template variables with actual values
 *
 * @param {string} template - HTML template string
 * @param {Object} meta_data - Meta tag values
 * @returns {string} Rendered HTML
 */
function render_template(template, meta_data) {
  let rendered = template

  // Replace all template variables
  for (const [key, value] of Object.entries(meta_data)) {
    const placeholder = `{{${key}}}`
    rendered = rendered.replace(new RegExp(placeholder, 'g'), value || '')
  }

  return rendered
}

/**
 * Parse request URL to extract content information
 *
 * @param {string} url_path - Request URL path
 * @returns {Object} Content type and identifiers
 */
function parse_request_url(url_path) {
  // Remove leading slash and split path
  const clean_path = url_path.replace(/^\/+/, '')
  const parts = clean_path.split('/')

  if (!clean_path || clean_path === '/') {
    return { type: 'home' }
  }

  // Check for thread URLs: /thread/:id
  if (parts[0] === 'thread' && parts[1]) {
    return {
      type: 'thread',
      thread_id: parts[1]
    }
  }

  // Check for entity file paths (*.md files)
  if (clean_path.endsWith('.md')) {
    return {
      type: 'entity',
      entity_path: clean_path
    }
  }

  // Check for directory requests that might contain entities
  // Directory requests without file extension could be entity directories
  if (parts.length > 0 && !clean_path.includes('.')) {
    // Check if this looks like an entity type directory
    const entity_types = [
      'task',
      'text',
      'workflow',
      'guideline',
      'tag',
      'thread',
      'physical-item',
      'physical-location'
    ]
    if (entity_types.includes(parts[0])) {
      return {
        type: 'directory',
        path: clean_path,
        entity_type: parts[0]
      }
    }
  }

  // Default to general page
  return { type: 'page', path: clean_path }
}

/**
 * Dynamic HTML rendering middleware
 * Replaces static file serving with dynamic meta tag generation
 *
 * @param {Object} options - Configuration options
 * @param {string} options.base_url - Base URL for generating absolute URLs
 * @returns {Function} Express middleware function
 */
export function create_render_html_middleware({
  base_url = config.production_url
} = {}) {
  return async (req, res, next) => {
    try {
      log(`Processing request for: ${req.path}`)

      // Parse the request URL
      const content_info = parse_request_url(req.path)

      let meta_data
      let user_public_key = null

      // Extract user public key from JWT token or query params
      if (req.user && req.user.user_public_key) {
        user_public_key = req.user.user_public_key
      }

      // Generate meta data based on content type
      switch (content_info.type) {
        case 'thread':
          log(
            `Extracting thread meta data for thread: ${content_info.thread_id}`
          )
          meta_data = await extract_meta_data({
            thread_id: content_info.thread_id,
            user_public_key,
            base_url
          })
          break

        case 'entity':
          log(`Entity page requested: ${content_info.entity_path}`)
          meta_data = await extract_meta_data({
            entity_path: content_info.entity_path,
            user_public_key,
            base_url
          })
          break

        case 'directory': {
          log(`Directory page requested: ${content_info.path}`)
          meta_data = await extract_meta_data({
            user_public_key,
            base_url
          })
          // Customize for directory pages
          const entity_type_name = content_info.entity_type
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
          meta_data.PAGE_TITLE = `${entity_type_name} Directory - Base`
          meta_data.OG_TITLE = `${entity_type_name} Directory`
          meta_data.OG_DESCRIPTION = `Browse ${entity_type_name.toLowerCase()} entities in the Base system`
          meta_data.META_DESCRIPTION = meta_data.OG_DESCRIPTION
          break
        }

        case 'home':
          log('Home page requested')
          meta_data = await extract_meta_data({
            user_public_key,
            base_url
          })
          break

        default:
          log(`General page requested: ${content_info.path}`)
          meta_data = await extract_meta_data({
            user_public_key,
            base_url
          })
          meta_data.PAGE_TITLE = `${content_info.path} - Base`
          meta_data.OG_TITLE = content_info.path
          meta_data.OG_DESCRIPTION = `Page: ${content_info.path}`
          meta_data.META_DESCRIPTION = meta_data.OG_DESCRIPTION
          break
      }

      // Update URLs to be absolute
      meta_data.OG_URL = `${base_url}${req.path}`

      // Generate dynamic script tags
      const script_tags = await generate_script_tags()
      meta_data.SCRIPT_TAGS = script_tags

      // Load template (cached after first load)
      if (!template_cache) {
        await load_template()
      }

      // Render HTML with meta data
      const rendered_html = render_template(template_cache, meta_data)

      // Send the rendered HTML
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      })

      res.send(rendered_html)

      log(`Successfully rendered HTML for: ${req.path}`)
    } catch (error) {
      log(`Error rendering HTML for ${req.path}: ${error.message}`)

      // Fallback to serving a basic HTML page on error
      const fallback_html = `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Base - Human-in-the-Loop System</title>
          </head>
          <body>
            <noscript>Please enable JavaScript to use this application.</noscript>
            <div id="app"></div>
          </body>
        </html>
      `

      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      })

      res.send(fallback_html)
    }
  }
}

/**
 * Clear template cache (useful for development)
 */
export function clear_template_cache() {
  template_cache = null
  log('Template cache cleared')
}

export default create_render_html_middleware
