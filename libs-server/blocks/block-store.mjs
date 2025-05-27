import debug from 'debug'

import db from '#db'
import { compute_cid } from './block-converter.mjs'

const log = debug('block-store')

/**
 * Block storage using PostgreSQL database with Knex
 */
export class BlockStore {
  /**
   * Constructor for block store
   * @param {Object} options - Options for the store
   * @param {String} options.user_id - User ID for blocks
   */
  constructor({ user_id }) {
    this.user_id = user_id
  }

  /**
   * Store a block in the database
   * @param {Object} block - Block to store
   * @returns {Object} - Stored block with DB ID
   */
  async store_block(block) {
    log('store_block', block)

    // Ensure block has a CID
    if (!block.block_cid) {
      block.block_cid = await compute_cid(block)
    }

    // Use transaction for atomicity
    return await db.transaction(async (trx) => {
      // Insert or update the block
      const block_result = await trx('blocks')
        .insert({
          block_cid: block.block_cid,
          type: block.type,
          content: block.content,
          user_id: this.user_id,
          position_start_line: block.metadata?.position?.start?.line,
          position_start_character: block.metadata?.position?.start?.character,
          position_end_line: block.metadata?.position?.end?.line,
          position_end_character: block.metadata?.position?.end?.character
        })
        .onConflict('block_cid')
        .merge({
          updated_at: db.fn.now(),
          position_start_line: block.metadata?.position?.start?.line,
          position_start_character: block.metadata?.position?.start?.character,
          position_end_line: block.metadata?.position?.end?.line,
          position_end_character: block.metadata?.position?.end?.character
        })
        .returning('block_id')

      const block_id = block_result[0].block_id

      // Store attributes if present
      if (block.attributes && Object.keys(block.attributes).length > 0) {
        // Delete existing attributes first
        await trx('block_attributes').where({ block_id }).delete()

        // Insert new attributes
        const attribute_rows = Object.entries(block.attributes).map(
          ([key, value]) => ({
            block_id,
            key,
            value
          })
        )

        if (attribute_rows.length > 0) {
          await trx('block_attributes').insert(attribute_rows)
        }
      }

      // TODO relate block to entity

      return { ...block, block_id }
    })
  }

  /**
   * Get a block by CID
   * @param {String} block_cid - Content ID to retrieve
   * @returns {Object} - Retrieved block
   */
  async get_block_by_cid(block_cid) {
    log('get_block_by_cid', block_cid)

    const block_data = await db('blocks')
      .where({
        block_cid,
        user_id: this.user_id
      })
      .select(
        'block_id',
        'block_cid',
        'type',
        'content',
        'created_at',
        'updated_at',
        'position_start_line',
        'position_start_character',
        'position_end_line',
        'position_end_character'
      )
      .first()

    if (!block_data) {
      throw new Error(`Block with CID ${block_cid} not found`)
    }

    const attributes = await this._get_block_attributes(block_data.block_id)
    const relationships = await this._get_block_relationships(
      block_data.block_id
    )

    return this._format_block(block_data, attributes, relationships)
  }

  /**
   * Get a block by database ID
   * @param {String} block_id - Database block ID
   * @returns {Object} - Retrieved block
   */
  async get_block(block_id) {
    log('get_block', block_id)

    const block_data = await db('blocks')
      .where({
        block_id,
        user_id: this.user_id
      })
      .select(
        'block_id',
        'block_cid',
        'type',
        'content',
        'created_at',
        'updated_at',
        'position_start_line',
        'position_start_character',
        'position_end_line',
        'position_end_character'
      )
      .first()

    if (!block_data) {
      throw new Error(`Block with ID ${block_id} not found`)
    }

    const attributes = await this._get_block_attributes(block_id)
    const relationships = await this._get_block_relationships(block_id)

    return this._format_block(block_data, attributes, relationships)
  }

  /**
   * Get document and all its blocks
   * @param {String} markdown_file_root_block_cid - Root block CID
   * @returns {Object} - Document with all blocks
   */
  async get_document(markdown_file_root_block_cid) {
    log('get_document', markdown_file_root_block_cid)

    // Get the document block
    const document = await this.get_block_by_cid(markdown_file_root_block_cid)

    if (document.type !== 'markdown_file') {
      throw new Error(
        `Block with CID ${markdown_file_root_block_cid} is not a markdown_file`
      )
    }

    // TODO get entity for document

    // Get all blocks in the document tree
    const blocks = {}
    blocks[document.block_cid] = document

    // Collect all child blocks recursively
    await this._collect_child_blocks(document.block_id, blocks)

    return { document, blocks }
  }

  /**
   * Get a document by file path
   * @param {String} file_path - Path to the file
   * @returns {Object} - Document with all blocks
   */
  async get_document_by_path(file_path) {
    log('get_document_by_path', file_path)

    const result = await db('blocks as b')
      .join('documents as d', 'b.block_id', 'd.block_id')
      .where({
        'd.file_path': file_path,
        'b.user_id': this.user_id
      })
      .select('b.block_cid')
      .first()

    if (!result) {
      throw new Error(`Document with path ${file_path} not found`)
    }

    return await this.get_document(result.block_cid)
  }

  /**
   * Store a complete document with all its blocks
   * @param {Object} doc_structure - Document structure from markdown_to_blocks
   * @returns {String} - CID of the markdown file root block
   */
  async store_document(doc_structure) {
    log('store_document', doc_structure)

    const { markdown_file_root_block, blocks } = doc_structure

    return await db.transaction(async (trx) => {
      // Create a transaction-scoped store
      const tx_store = new BlockStore({
        db: trx,
        user_id: this.user_id
      })

      // Store all non-root blocks first
      const stored_blocks = {}
      const relationship_map = {}
      const top_level_blocks = []

      for (const [block_cid, block] of Object.entries(blocks)) {
        const stored_block = await tx_store.store_block(block)
        stored_blocks[block_cid] = stored_block

        // Track relationships to update later
        if (block.relationships.parent) {
          if (!relationship_map[stored_block.block_id]) {
            relationship_map[stored_block.block_id] = []
          }

          relationship_map[stored_block.block_id].push({
            relationship_type: 'parent',
            parent_block_cid: block.relationships.parent
          })
        } else {
          // If no parent is specified, this is a top-level block
          top_level_blocks.push(stored_block)
        }
      }

      // Store markdown file root block
      const stored_root_block = await tx_store.store_block(
        markdown_file_root_block
      )
      stored_blocks[markdown_file_root_block.block_cid] = stored_root_block

      // Add relationships for top-level blocks with root
      for (const top_level_block of top_level_blocks) {
        relationship_map[top_level_block.block_id] =
          relationship_map[top_level_block.block_id] || []
        relationship_map[top_level_block.block_id].push({
          relationship_type: 'parent',
          parent_block_cid: stored_root_block.block_cid
        })
      }

      // Now update all relationships
      for (const [block_id, relationships] of Object.entries(
        relationship_map
      )) {
        for (const rel of relationships) {
          const parent_block = stored_blocks[rel.parent_block_cid]

          if (parent_block) {
            // Insert child_of relationship
            await trx('block_relationships')
              .insert({
                source_block_id: block_id,
                target_block_id: parent_block.block_id,
                relationship_type: 'child_of'
              })
              .onConflict([
                'source_block_id',
                'target_block_id',
                'relationship_type'
              ])
              .ignore()

            // Insert parent_of relationship
            await trx('block_relationships')
              .insert({
                source_block_id: parent_block.block_id,
                target_block_id: block_id,
                relationship_type: 'parent_of'
              })
              .onConflict([
                'source_block_id',
                'target_block_id',
                'relationship_type'
              ])
              .ignore()
          }
        }
      }

      return markdown_file_root_block.block_cid
    })
  }

  /**
   * Search for blocks by content and type
   * @param {Object} params - Search parameters
   * @param {String} params.query - Search query
   * @param {String} params.type - Block type to filter by
   * @param {Number} params.limit - Maximum results to return
   * @returns {Array} - Matching blocks
   */
  async search_blocks({ query, type = null, limit = 100 }) {
    log('search_blocks', query, type, limit)

    const search_terms = query.split(/\s+/).join(' & ')

    // Build the base query
    const search_query = db('blocks')
      .where('user_id', this.user_id)
      .whereRaw("search_vector @@ to_tsquery('english', ?)", [search_terms])
      .select(
        'block_id',
        'block_cid',
        'type',
        'content',
        'created_at',
        'updated_at',
        'position_start_line',
        'position_start_character',
        'position_end_line',
        'position_end_character',
        db.raw("ts_rank(search_vector, to_tsquery('english', ?)) AS rank", [
          search_terms
        ])
      )

    // Add type filter if specified
    if (type) {
      search_query.andWhere('type', type)
    }

    // Apply order and limit
    const result = await search_query.orderBy('rank', 'desc').limit(limit)

    // Format results
    const blocks = []
    for (const row of result) {
      const attributes = await this._get_block_attributes(row.block_id)
      const relationships = await this._get_block_relationships(row.block_id)
      blocks.push(this._format_block(row, attributes, relationships))
    }

    return blocks
  }

  /**
   * Fetch attributes for a block
   * @param {String} block_id - Block ID
   * @returns {Object} - Attributes map
   * @private
   */
  async _get_block_attributes(block_id) {
    log('get_block_attributes', block_id)

    const result = await db('block_attributes')
      .where({ block_id })
      .select('key', 'value')

    const attributes = {}
    for (const row of result) {
      attributes[row.key] = row.value
    }

    return attributes
  }

  /**
   * Fetch relationships for a block
   * @param {String} block_id - Block ID
   * @returns {Object} - Relationships object
   * @private
   */
  async _get_block_relationships(block_id) {
    log('get_block_relationships', block_id)

    // Get child relationships
    const children_result = await db('block_relationships as r')
      .join('blocks as b', 'r.target_block_id', 'b.block_id')
      .where({
        'r.source_block_id': block_id,
        'r.relationship_type': 'parent_of'
      })
      .select('b.block_cid')

    // Get parent relationships
    const parent_result = await db('block_relationships as r')
      .join('blocks as b', 'r.target_block_id', 'b.block_id')
      .where({
        'r.source_block_id': block_id,
        'r.relationship_type': 'child_of'
      })
      .select('b.block_cid')

    // Get references
    const refs_result = await db('block_relationships as r')
      .join('blocks as b', 'r.target_block_id', 'b.block_id')
      .where({
        'r.source_block_id': block_id,
        'r.relationship_type': 'references'
      })
      .select('b.block_cid')

    return {
      parent: parent_result.length > 0 ? parent_result[0].block_cid : null,
      children: children_result.map((row) => row.block_cid),
      references: refs_result.map((row) => row.block_cid)
    }
  }

  /**
   * Recursively collect all child blocks
   * @param {String} block_id - Starting block ID
   * @param {Object} collected_blocks - Object to store collected blocks
   * @private
   */
  async _collect_child_blocks(block_id, collected_blocks) {
    // Get all children
    const children_result = await db('block_relationships')
      .where({
        source_block_id: block_id,
        relationship_type: 'parent_of'
      })
      .select('target_block_id')

    // For each child, get the block and add to collection
    for (const row of children_result) {
      const child_block = await this.get_block(row.target_block_id)

      if (!collected_blocks[child_block.block_cid]) {
        collected_blocks[child_block.block_cid] = child_block
        await this._collect_child_blocks(child_block.block_id, collected_blocks)
      }
    }
  }

  /**
   * Format a block from database rows
   * @param {Object} row - Database row
   * @param {Object} attributes - Block attributes
   * @param {Object} relationships - Block relationships
   * @returns {Object} - Formatted block
   * @private
   */
  _format_block(row, attributes, relationships) {
    log('format_block', row, attributes, relationships)

    return {
      block_id: row.block_id,
      block_cid: row.block_cid,
      type: row.type,
      content: row.content,
      metadata: {
        created_at: row.created_at,
        updated_at: row.updated_at,
        position: {
          start: {
            line: row.position_start_line || 0,
            character: row.position_start_character || 0
          },
          end: {
            line: row.position_end_line || 0,
            character: row.position_end_character || 0
          }
        }
      },
      attributes,
      relationships
    }
  }
}
