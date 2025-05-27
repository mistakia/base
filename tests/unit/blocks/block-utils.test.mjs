/* global describe, it, before, after */

import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  import_file,
  export_file,
  search_blocks,
  show_block,
  BLOCK_TYPES
} from '#libs-server/blocks/index.mjs'
import { create_test_user } from '#tests/utils/index.mjs'
import db from '#db'

describe('Block Utils Unit Tests', () => {
  let test_user
  let temp_dir
  let test_file_path
  let markdown_file_root_block_cid

  before(async () => {
    test_user = await create_test_user()

    // Create a temporary directory for test files
    temp_dir = path.join(os.tmpdir(), `block-utils-test-${Date.now()}`)
    await fs.mkdir(temp_dir, { recursive: true })

    // Create a test markdown file
    test_file_path = path.join(temp_dir, 'test-doc.md')
    const test_content = `# Test Document
    
This is a test document for block utilities unit tests.

## Section 1

- Item 1
- Item 2
`
    await fs.writeFile(test_file_path, test_content, 'utf-8')

    // Clean up any existing test data
    await db('blocks').where({ user_id: test_user.user_id }).delete()
  })

  after(async () => {
    // Clean up temp files
    try {
      await fs.rm(temp_dir, { recursive: true, force: true })
    } catch (err) {
      console.error(`Error cleaning up temp directory: ${err.message}`)
    }

    // Clean up database
    await db('blocks').where({ user_id: test_user.user_id }).delete()
  })

  describe('import_file', () => {
    it('should import a file and return success object', async () => {
      const result = await import_file({
        file_path: test_file_path,
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('markdown_file_root_block_cid')
      expect(result).to.have.property('file_path', test_file_path)

      // Save CID for later tests
      markdown_file_root_block_cid = result.markdown_file_root_block_cid

      // Verify blocks were created in database
      const blocks = await db('blocks')
        .where({ user_id: test_user.user_id })
        .select('*')

      expect(blocks.length).to.be.at.least(3) // Should have several blocks for the document
    })

    it('should return error object when importing non-existent file', async () => {
      const result = await import_file({
        file_path: 'non-existent-file.md',
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', false)
      expect(result).to.have.property('error')
      expect(result.error).to.be.a('string')
    })
  })

  describe('show_block', () => {
    it('should show document details', async () => {
      // Make sure we have a document CID from previous test
      expect(markdown_file_root_block_cid).to.be.a('string')

      const result = await show_block({
        block_cid: markdown_file_root_block_cid,
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('type', BLOCK_TYPES.MARKDOWN_FILE)
      expect(result).to.have.property('block_cid', markdown_file_root_block_cid)
      expect(result).to.have.property('document')
      expect(result.document).to.have.property('document')
      expect(result.document.document).to.have.property('attributes')
      expect(result.document.document.attributes).to.have.property(
        'title',
        'test-doc'
      )
      expect(result.document).to.have.property('blocks')
      expect(Object.keys(result.document.blocks).length).to.be.at.least(3)
    })

    it('should show block details', async () => {
      // Get a non-document block from the database
      const block = await db('blocks')
        .where({
          user_id: test_user.user_id,
          type: BLOCK_TYPES.HEADING
        })
        .first()

      const result = await show_block({
        block_cid: block.block_cid,
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('type', BLOCK_TYPES.HEADING)
      expect(result).to.have.property('block_cid', block.block_cid)
      expect(result).to.have.property('block')
      expect(result.block).to.have.property('type', BLOCK_TYPES.HEADING)
    })

    it('should return error object for invalid CID', async () => {
      const result = await show_block({
        block_cid: 'invalid-cid',
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', false)
      expect(result).to.have.property('error')
      expect(result.error).to.be.a('string')
    })
  })

  describe('search_blocks', () => {
    it('should search for blocks by content', async () => {
      const result = await search_blocks({
        query: 'test',
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('results')
      expect(result.results).to.be.an('array')
      expect(result.results.length).to.be.at.least(1)
      expect(result).to.have.property('count', result.results.length)
      expect(result).to.have.property('query', 'test')

      if (result.results.length > 0) {
        expect(result.results[0]).to.have.property('block_cid')
        expect(result.results[0]).to.have.property('type')
        expect(result.results[0]).to.have.property('content')
      }
    })

    it('should handle string limit parameter', async () => {
      const result = await search_blocks({
        query: 'test',
        limit: '2',
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result.results).to.be.an('array')
      expect(result.results.length).to.be.at.most(2)
      expect(result).to.have.property('count', result.results.length)
    })

    it('should return empty results for non-matching query', async () => {
      const result = await search_blocks({
        query: 'nonexistenttext',
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result.results).to.be.an('array')
      expect(result.results).to.have.length(0)
      expect(result).to.have.property('count', 0)
    })
  })

  describe('export_file', () => {
    it('should export document to a markdown file', async () => {
      const exported_file_path = path.join(temp_dir, 'exported-doc.md')

      const result = await export_file({
        block_cid: markdown_file_root_block_cid,
        file_path: exported_file_path,
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('file_path', exported_file_path)
      expect(result).to.have.property('block_cid', markdown_file_root_block_cid)

      // Verify file was created
      const file_exists = await fs
        .access(exported_file_path)
        .then(() => true)
        .catch(() => false)

      expect(file_exists).to.be.true

      // Read file contents and verify it contains expected content
      const content = await fs.readFile(exported_file_path, 'utf-8')
      expect(content).to.include('# Test Document')
      expect(content).to.include('## Section 1')
    })

    it('should return error object for invalid CID', async () => {
      const result = await export_file({
        block_cid: 'invalid-cid',
        file_path: path.join(temp_dir, 'error-doc.md'),
        user_id: test_user.user_id
      })

      expect(result).to.have.property('success', false)
      expect(result).to.have.property('error')
      expect(result.error).to.be.a('string')
    })
  })
})
