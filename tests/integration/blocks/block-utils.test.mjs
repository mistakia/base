import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import db from '#db'
import {
  import_file,
  export_file,
  search_blocks,
  show_block,
  BLOCK_TYPES
} from '#libs-server/blocks/index.mjs'
import { create_test_user } from '#tests/utils/index.mjs'

describe('Block Utilities Integration Tests', () => {
  let temp_dir
  let test_file_path
  let exported_file_path
  let markdown_file_root_block_cid
  let test_user

  before(async () => {
    test_user = await create_test_user()

    // Create temporary directory for test files
    temp_dir = path.join(os.tmpdir(), `block-utils-integration-${Date.now()}`)
    await fs.mkdir(temp_dir, { recursive: true })

    // Create a test markdown file with more complex content
    test_file_path = path.join(temp_dir, 'integration-doc.md')
    const test_content = `---
title: Integration Test Document
type: markdown_file
tags: [test, markdown, integration]
---

# Integration Test Document
    
This is a test document for the block utilities integration tests.

## Section 1: Lists

- Item 1
- Item 2
- Item 3

## Section 2: Formatting

Some paragraph text with **bold** and *italic* formatting.

## Section 3: Code

\`\`\`javascript
function test_function() {
  console.log("Testing code blocks")
  return true
}
\`\`\`

## Section 4: Links

[Test Link](https://example.com)
`
    await fs.writeFile(test_file_path, test_content, 'utf-8')

    // Path for exported file
    exported_file_path = path.join(temp_dir, 'exported-doc.md')

    // Ensure we start with a clean database for this test
    await db('blocks').where({ user_id: test_user.user_id }).delete()
  })

  after(async () => {
    // Clean up temp files
    try {
      await fs.rm(temp_dir, { recursive: true, force: true })
    } catch (err) {
      console.error(`Error cleaning up temp directory: ${err.message}`)
    }
  })

  it('should import a markdown file', async () => {
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

    expect(blocks.length).to.be.at.least(5) // Should have several blocks for the document

    // Verify markdown file root block type in database
    const root_blocks = blocks.filter((block) => block.type === 'markdown_file')
    expect(root_blocks.length).to.equal(1)

    // Verify headings
    const heading_blocks = blocks.filter((block) => block.type === 'heading')
    expect(heading_blocks.length).to.be.at.least(4)

    // Verify code blocks
    const code_blocks = blocks.filter((block) => block.type === 'code')
    expect(code_blocks.length).to.be.at.least(1)
  })

  it('should show document details', async () => {
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
      'integration-doc'
    )
    expect(result.document).to.have.property('blocks')

    // Check that all block types are present
    const block_types = Object.values(result.document.blocks).map(
      (block) => block.type
    )
    expect(block_types).to.include('markdown_file')
    expect(block_types).to.include('heading')
    expect(block_types).to.include('paragraph')
    expect(block_types).to.include('list')
    expect(block_types).to.include('code')
  })

  it('should search for blocks by content', async () => {
    // Test search by specific content
    const result = await search_blocks({
      query: 'integration',
      user_id: test_user.user_id
    })

    expect(result).to.have.property('success', true)
    expect(result).to.have.property('results')
    expect(result.results).to.be.an('array')
    expect(result.results.length).to.be.at.least(1)
    expect(result).to.have.property('count', result.results.length)
    expect(result).to.have.property('query', 'integration')

    if (result.results.length > 0) {
      expect(result.results[0]).to.have.property('block_cid')
      expect(result.results[0]).to.have.property('type')
      expect(result.results[0]).to.have.property('content')
    }

    // Test search with type filter
    const heading_results = await search_blocks({
      query: 'section',
      type: 'heading',
      user_id: test_user.user_id
    })

    expect(heading_results).to.have.property('success', true)
    expect(heading_results).to.have.property('results')
    expect(heading_results.results).to.be.an('array')
    expect(heading_results.results.length).to.be.at.least(1)
    expect(heading_results).to.have.property('type', 'heading')

    if (heading_results.results.length > 0) {
      expect(heading_results.results[0]).to.have.property('type', 'heading')
    }

    // Test search with limit
    const limited_results = await search_blocks({
      query: 'test',
      limit: 2,
      user_id: test_user.user_id
    })

    expect(limited_results).to.have.property('success', true)
    expect(limited_results).to.have.property('results')
    expect(limited_results.results).to.be.an('array')
    expect(limited_results.results.length).to.be.at.most(2)
    expect(limited_results).to.have.property(
      'count',
      limited_results.results.length
    )
  })

  it('should export document to a markdown file', async () => {
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
    expect(content).to.include('# Integration Test Document')
    expect(content).to.include('## Section 1: Lists')
    expect(content).to.include('## Section 2: Formatting')
    expect(content).to.include('## Section 3: Code')
    expect(content).to.include('## Section 4: Links')
    expect(content).to.include('function test_function()')
  })
})
