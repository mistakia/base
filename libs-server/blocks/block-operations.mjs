/**
 * Block Operations
 * These functions provide high-level operations for working with the block system
 * and can be used by CLI tools or other parts of the application
 */

import fs from 'fs/promises'
import debug from 'debug'
import { BlockStore } from './block-store.mjs'
import {
  blocks_to_markdown,
  markdown_file_to_blocks
} from './block-converter.mjs'
import { BLOCK_TYPES } from './block-schemas.mjs'

const log = debug('block-operations')

/**
 * Import a markdown file to the block store
 */
export async function import_file({ file_path, user_id }) {
  try {
    const store = new BlockStore({ user_id })
    const { markdown_file_root_block, blocks } = await markdown_file_to_blocks({
      file_path
    })
    const markdown_file_root_block_cid = await store.store_document({
      markdown_file_root_block,
      blocks
    })

    return {
      success: true,
      markdown_file_root_block_cid,
      file_path
    }
  } catch (err) {
    log('Error importing file', err)
    return {
      success: false,
      error: err.message
    }
  }
}

/**
 * Export a document from the block store to a markdown file
 */
export async function export_file({ block_cid, file_path, user_id }) {
  try {
    const store = new BlockStore({ user_id })
    const doc_structure = await store.get_document(block_cid)
    const markdown = await blocks_to_markdown(doc_structure)

    await fs.writeFile(file_path, markdown, 'utf-8')

    return {
      success: true,
      file_path,
      block_cid
    }
  } catch (err) {
    log('Error exporting file', err)
    return {
      success: false,
      error: err.message
    }
  }
}

/**
 * Search for blocks by content
 */
export async function search_blocks({ query, type, limit = 10, user_id }) {
  try {
    const store = new BlockStore({ user_id })
    const results = await store.search_blocks({
      query,
      type,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : limit
    })

    return {
      success: true,
      results,
      query,
      type,
      count: results.length
    }
  } catch (err) {
    log('Error searching blocks', err)
    return {
      success: false,
      error: err.message
    }
  }
}

/**
 * Show block details by CID
 */
export async function show_block({ block_cid, user_id }) {
  try {
    const store = new BlockStore({ user_id })

    try {
      // Try to get as a document first
      const doc_structure = await store.get_document(block_cid)
      return {
        success: true,
        type: BLOCK_TYPES.MARKDOWN_FILE,
        block_cid,
        document: doc_structure
      }
    } catch (err) {
      log('Error showing block', err)
      // If not a document, try to get as a single block
      const block = await store.get_block_by_cid(block_cid)
      return {
        success: true,
        type: block.type,
        block_cid,
        block
      }
    }
  } catch (err) {
    log('Error showing block', err)
    return {
      success: false,
      error: err.message
    }
  }
}
