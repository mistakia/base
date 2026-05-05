/**
 * Embedding Pipeline
 *
 * Background process that incrementally computes and stores entity embeddings.
 * Hooks into existing entity file change events from user-base-watcher.
 */

import crypto from 'crypto'
import fs from 'fs/promises'
import debug from 'debug'
import frontMatter from 'front-matter'

import { embed_texts } from '#libs-server/llm/embedding-client.mjs'
import {
  upsert_embeddings,
  delete_entity_embeddings,
  get_embedding_hashes
} from '#libs-server/embedded-database-index/sqlite/sqlite-embedding-queries.mjs'
import { extract_base_uri_from_entity_path } from '#libs-server/embedded-database-index/sync/index-file-watcher.mjs'

const log = debug('search:embedding-pipeline')

const DEBOUNCE_DELAY_MS = 15000
let debounce_timer = null
const pending_files = new Set()
let is_processing = false

/**
 * Initialize the embedding pipeline.
 * Runs a background sync to detect stale embeddings, then listens for file changes.
 *
 * @param {Object} params
 * @param {string} params.user_base_directory - Path to user base directory
 */
export async function initialize_embedding_pipeline({ user_base_directory }) {
  log('Initializing embedding pipeline')

  // Run background sync without blocking startup
  run_background_sync({ user_base_directory }).catch((error) => {
    log('Background sync error: %s', error.message)
  })

  log('Embedding pipeline initialized')
}

/**
 * Handle entity file change event from user-base-watcher.
 * Debounces changes and processes in batch.
 *
 * @param {string} file_path - Absolute path to changed entity file
 */
export function handle_embedding_file_change(file_path) {
  if (!file_path.endsWith('.md')) return

  log('Queueing file for embedding: %s', file_path)
  pending_files.add(file_path)

  if (debounce_timer) {
    clearTimeout(debounce_timer)
  }

  debounce_timer = setTimeout(() => {
    debounce_timer = null
    process_pending_files().catch((error) => {
      log('Error processing pending files: %s', error.message)
    })
  }, DEBOUNCE_DELAY_MS)
}

/**
 * Handle entity file delete event.
 *
 * @param {string} file_path - Absolute path to deleted entity file
 */
export async function handle_embedding_file_delete(file_path) {
  const base_uri = extract_base_uri_from_entity_path(file_path)
  if (!base_uri) return

  log('Deleting embeddings for removed file: %s', base_uri)
  try {
    await delete_entity_embeddings({ base_uri })
  } catch (error) {
    log('Error deleting embeddings for %s: %s', base_uri, error.message)
  }
}

/**
 * Process all pending file changes.
 */
async function process_pending_files() {
  if (is_processing) {
    log('Already processing, will retry after current batch')
    // Reschedule so these files are not dropped
    if (!debounce_timer) {
      debounce_timer = setTimeout(() => {
        debounce_timer = null
        process_pending_files().catch((error) => {
          log('Error processing pending files: %s', error.message)
        })
      }, DEBOUNCE_DELAY_MS)
    }
    return
  }

  const files = Array.from(pending_files)
  pending_files.clear()

  if (files.length === 0) return

  is_processing = true
  log('Processing %d pending files', files.length)

  try {
    // Fetch all embedding hashes once for the entire batch
    const all_hashes = await get_embedding_hashes()
    const hash_map = new Map()
    for (const row of all_hashes) {
      if (!hash_map.has(row.base_uri)) {
        hash_map.set(row.base_uri, new Map())
      }
      hash_map.get(row.base_uri).set(row.chunk_index, row.content_hash)
    }

    for (const file_path of files) {
      try {
        await process_entity_file({ file_path, hash_map })
      } catch (error) {
        log('Error processing %s: %s', file_path, error.message)
      }
    }
  } finally {
    is_processing = false

    // If more files accumulated during processing, schedule another run
    if (pending_files.size > 0) {
      debounce_timer = setTimeout(() => {
        debounce_timer = null
        process_pending_files().catch((error) => {
          log('Error processing pending files: %s', error.message)
        })
      }, DEBOUNCE_DELAY_MS)
    }
  }
}

/**
 * Process a single entity file: read, hash, chunk, embed, store.
 *
 * @param {Object} params
 * @param {string} params.file_path - Absolute path to entity file
 * @param {Map<string, Map<number, string>>} [params.hash_map] - Pre-fetched hash map (base_uri -> chunk_index -> content_hash)
 */
export async function process_entity_file({ file_path, hash_map }) {
  const base_uri = extract_base_uri_from_entity_path(file_path)
  if (!base_uri) {
    log('Could not extract base_uri from %s', file_path)
    return
  }

  log('Processing entity file: %s', base_uri)

  const content = await fs.readFile(file_path, 'utf-8')
  const parsed = frontMatter(content)
  const title = parsed.attributes.title || ''
  const description = parsed.attributes.description || ''
  const body = parsed.body || ''

  if (!body.trim()) {
    log('No body content in %s, skipping', base_uri)
    return
  }

  const chunks = chunk_markdown_content({ content: body, title, description })

  if (chunks.length === 0) {
    log('No chunks produced for %s', base_uri)
    return
  }

  // Use pre-fetched hash map or fetch for this entity
  const existing_map = hash_map
    ? hash_map.get(base_uri) || new Map()
    : await get_entity_hashes(base_uri)

  // If chunk count changed or any content changed, re-embed all chunks
  const needs_update =
    chunks.length !== existing_map.size ||
    chunks.some(
      (chunk) => existing_map.get(chunk.chunk_index) !== chunk.content_hash
    )

  if (!needs_update) {
    log('All chunks up to date for %s', base_uri)
    return
  }

  log('Embedding %d chunks for %s', chunks.length, base_uri)

  try {
    const chunk_texts = chunks.map((c) => c.chunk_text)
    const { embeddings } = await embed_texts({ texts: chunk_texts })

    const chunks_with_embeddings = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]
    }))

    await upsert_embeddings({ base_uri, chunks: chunks_with_embeddings })
    log('Stored %d embeddings for %s', chunks.length, base_uri)
  } catch (error) {
    log('Embedding failed for %s: %s', base_uri, error.message)
  }
}

/**
 * Fetch embedding hashes for a single entity.
 *
 * @param {string} base_uri - Entity base URI
 * @returns {Promise<Map<number, string>>} chunk_index -> content_hash
 */
async function get_entity_hashes(base_uri) {
  const all_hashes = await get_embedding_hashes()
  const entity_map = new Map()
  for (const row of all_hashes) {
    if (row.base_uri === base_uri) {
      entity_map.set(row.chunk_index, row.content_hash)
    }
  }
  return entity_map
}

/**
 * Split markdown content by h1-h3 headers, prepending title and description to each chunk.
 *
 * @param {Object} params
 * @param {string} params.content - Markdown body content (without frontmatter)
 * @param {string} params.title - Entity title
 * @param {string} params.description - Entity description
 * @returns {Array<{chunk_index: number, content_hash: string, chunk_text: string}>}
 */
export function chunk_markdown_content({ content, title, description }) {
  const lines = content.split('\n')
  const sections = []
  let current_section_lines = []

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line) && current_section_lines.length > 0) {
      sections.push(current_section_lines.join('\n').trim())
      current_section_lines = [line]
    } else {
      current_section_lines.push(line)
    }
  }

  // Push final section
  if (current_section_lines.length > 0) {
    const text = current_section_lines.join('\n').trim()
    if (text) {
      sections.push(text)
    }
  }

  // If no headers found, treat entire content as one chunk
  if (sections.length === 0 && content.trim()) {
    sections.push(content.trim())
  }

  const context_prefix = [
    title && `Title: ${title}`,
    description && `Description: ${description}`
  ]
    .filter(Boolean)
    .join('\n')

  return sections.map((section_text, index) => {
    const chunk_text = context_prefix
      ? `${context_prefix}\n\n${section_text}`
      : section_text

    const content_hash = crypto
      .createHash('sha256')
      .update(chunk_text)
      .digest('hex')
      .slice(0, 16)

    return {
      chunk_index: index,
      content_hash,
      chunk_text
    }
  })
}

/**
 * Background sync: compare all entity files against stored hashes, queue stale entries.
 *
 * @param {Object} params
 * @param {string} params.user_base_directory - Path to user base directory
 */
async function run_background_sync({ user_base_directory }) {
  log('Starting background embedding sync')

  const { ENTITY_DIRECTORIES } =
    await import('#libs-server/embedded-database-index/sync/index-sync-filters.mjs')

  const entity_files = []

  for (const dir of ENTITY_DIRECTORIES) {
    const dir_path = `${user_base_directory}/${dir}`
    try {
      const files = await collect_markdown_files(dir_path)
      entity_files.push(...files)
    } catch {
      log('Directory not found: %s', dir_path)
    }
  }

  log('Found %d entity files for sync', entity_files.length)

  // Queue all entity files for processing (staleness check happens per-file)
  for (const file_path of entity_files) {
    pending_files.add(file_path)
  }

  if (pending_files.size > 0) {
    await process_pending_files()
  }

  log('Background embedding sync complete')
}

/**
 * Recursively collect markdown files from a directory.
 *
 * @param {string} dir_path - Directory to scan
 * @returns {Promise<string[]>} Array of absolute file paths
 */
async function collect_markdown_files(dir_path) {
  const results = []
  const entries = await fs.readdir(dir_path, { withFileTypes: true })

  for (const entry of entries) {
    const full_path = `${dir_path}/${entry.name}`
    if (entry.isDirectory()) {
      const nested = await collect_markdown_files(full_path)
      results.push(...nested)
    } else if (entry.name.endsWith('.md')) {
      results.push(full_path)
    }
  }

  return results
}
