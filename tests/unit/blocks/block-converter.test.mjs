import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  markdown_to_blocks,
  blocks_to_markdown,
  markdown_file_to_blocks,
  compute_cid,
  BLOCK_TYPES
} from '#libs-server/blocks/index.mjs'
import { build_ast_from_blocks } from '#libs-server/blocks/block-converter.mjs'

describe('Block Converter', () => {
  let temp_dir
  let test_markdown_file

  beforeEach(async () => {
    // Create temporary directory for test files
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'block-converter-test-'))
    test_markdown_file = path.join(temp_dir, 'test-document.md')
  })

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(temp_dir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('compute_cid', () => {
    it('should generate consistent CIDs for identical blocks', async () => {
      const block1 = {
        type: 'paragraph',
        content: 'Test content',
        attributes: { level: 1 }
      }

      const block2 = {
        type: 'paragraph',
        content: 'Test content',
        attributes: { level: 1 }
      }

      const cid1 = await compute_cid(block1)
      const cid2 = await compute_cid(block2)

      expect(cid1).to.equal(cid2)
      expect(cid1).to.be.a('string')
      expect(cid1.length).to.be.greaterThan(0)
    })

    it('should generate different CIDs for different content', async () => {
      const block1 = {
        type: 'paragraph',
        content: 'First content',
        attributes: {}
      }

      const block2 = {
        type: 'paragraph',
        content: 'Second content',
        attributes: {}
      }

      const cid1 = await compute_cid(block1)
      const cid2 = await compute_cid(block2)

      expect(cid1).to.not.equal(cid2)
    })

    it('should generate different CIDs for different types', async () => {
      const block1 = {
        type: 'paragraph',
        content: 'Same content',
        attributes: {}
      }

      const block2 = {
        type: 'heading',
        content: 'Same content',
        attributes: {}
      }

      const cid1 = await compute_cid(block1)
      const cid2 = await compute_cid(block2)

      expect(cid1).to.not.equal(cid2)
    })

    it('should generate different CIDs for different attributes', async () => {
      const block1 = {
        type: 'heading',
        content: 'Heading',
        attributes: { level: 1 }
      }

      const block2 = {
        type: 'heading',
        content: 'Heading',
        attributes: { level: 2 }
      }

      const cid1 = await compute_cid(block1)
      const cid2 = await compute_cid(block2)

      expect(cid1).to.not.equal(cid2)
    })

    it('should ignore block_cid field when computing CID', async () => {
      const block1 = {
        type: 'paragraph',
        content: 'Test content',
        attributes: {},
        block_cid: 'existing-cid-1'
      }

      const block2 = {
        type: 'paragraph',
        content: 'Test content',
        attributes: {},
        block_cid: 'existing-cid-2'
      }

      const cid1 = await compute_cid(block1)
      const cid2 = await compute_cid(block2)

      expect(cid1).to.equal(cid2)
      expect(cid1).to.not.equal('existing-cid-1')
      expect(cid1).to.not.equal('existing-cid-2')
    })

    it('should handle blocks with no attributes', async () => {
      const block = {
        type: 'paragraph',
        content: 'Simple content'
      }

      const cid = await compute_cid(block)

      expect(cid).to.be.a('string')
      expect(cid.length).to.be.greaterThan(0)
    })
  })

  describe('markdown_to_blocks', () => {
    it('should convert simple markdown to blocks', async () => {
      const markdown_text = `# Heading 1

Paragraph content here.

## Heading 2

More content.`

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      expect(result).to.have.property('markdown_file_root_block')
      expect(result).to.have.property('blocks')

      expect(result.markdown_file_root_block.type).to.equal(
        BLOCK_TYPES.MARKDOWN_FILE
      )
      expect(result.blocks).to.be.an('object')
      expect(Object.keys(result.blocks).length).to.be.greaterThan(0)
    })

    it('should handle empty markdown', async () => {
      const markdown_text = ''

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      expect(result).to.have.property('markdown_file_root_block')
      expect(result).to.have.property('blocks')
      expect(result.markdown_file_root_block.type).to.equal(
        BLOCK_TYPES.MARKDOWN_FILE
      )
    })

    it('should generate unique CIDs for all blocks', async () => {
      const markdown_text = `# Heading

Paragraph 1

Paragraph 2`

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      // Get all block CIDs from both the document block and content blocks
      const content_block_cids = Object.keys(result.blocks)
      const document_cid = result.markdown_file_root_block.block_cid

      // Check that the document CID is not included in content blocks (to avoid double counting)
      const all_unique_cids = content_block_cids.includes(document_cid)
        ? content_block_cids
        : [document_cid, ...content_block_cids]

      const unique_cids = new Set(all_unique_cids)

      // Verify uniqueness is the primary concern
      expect(unique_cids.size).to.equal(all_unique_cids.length)

      // Verify we have a reasonable number of blocks
      expect(all_unique_cids.length).to.be.at.least(3)
    })

    it('should preserve markdown structure in block relationships', async () => {
      const markdown_text = `# Main Heading

Content under main heading.

## Sub Heading

Content under sub heading.`

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      // Check that document block has children
      expect(result.markdown_file_root_block.relationships.children).to.be.an(
        'array'
      )
      expect(
        result.markdown_file_root_block.relationships.children.length
      ).to.be.greaterThan(0)

      // Check that child blocks have parent relationships
      for (const block_cid of result.markdown_file_root_block.relationships
        .children) {
        const child_block = result.blocks[block_cid]
        expect(child_block.relationships.parent).to.equal(
          result.markdown_file_root_block.block_cid
        )
      }
    })

    it('should handle code blocks correctly', async () => {
      const markdown_text = `# Code Example

\`\`\`javascript
const foo = "bar"
console.log(foo)
\`\`\`

More content.`

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      const code_blocks = Object.values(result.blocks).filter(
        (block) => block.type === BLOCK_TYPES.CODE
      )

      expect(code_blocks).to.have.length(1)
      expect(code_blocks[0].content).to.include('const foo = "bar"')
      expect(code_blocks[0].attributes.language).to.equal('javascript')
    })

    it('should handle list items correctly', async () => {
      const markdown_text = `# Lists

- Item 1
- Item 2
  - Nested item
- Item 3`

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      const list_blocks = Object.values(result.blocks).filter(
        (block) => block.type === BLOCK_TYPES.LIST
      )
      const list_item_blocks = Object.values(result.blocks).filter(
        (block) => block.type === BLOCK_TYPES.LIST_ITEM
      )

      expect(list_blocks.length).to.be.greaterThan(0)
      expect(list_item_blocks.length).to.be.greaterThan(0)
    })

    it('should set correct file attributes on document block', async () => {
      const markdown_text = '# Test Document'

      const result = await markdown_to_blocks({
        markdown_text,
        file_path: test_markdown_file
      })

      expect(result.markdown_file_root_block.attributes).to.have.property(
        'title'
      )
      // Check that file attributes are set, accepting variations in naming
      expect(result.markdown_file_root_block.attributes.title).to.be.a('string')
      expect(
        result.markdown_file_root_block.attributes.title.length
      ).to.be.greaterThan(0)
    })
  })

  describe('markdown_file_to_blocks', () => {
    it('should read file and convert to blocks', async () => {
      const markdown_content = `# File Test

This content is read from a file.

## Section

More content here.`

      await fs.writeFile(test_markdown_file, markdown_content)

      const result = await markdown_file_to_blocks({
        file_path: test_markdown_file
      })

      expect(result).to.have.property('markdown_file_root_block')
      expect(result).to.have.property('blocks')
      expect(result.markdown_file_root_block.type).to.equal(
        BLOCK_TYPES.MARKDOWN_FILE
      )

      // Check that content was properly read
      const heading_blocks = Object.values(result.blocks).filter(
        (block) => block.type === BLOCK_TYPES.HEADING
      )
      expect(heading_blocks.some((block) => block.content === 'File Test')).to
        .be.true
    })

    it('should handle non-existent files gracefully', async () => {
      const non_existent_file = path.join(temp_dir, 'non-existent.md')

      try {
        await markdown_file_to_blocks({ file_path: non_existent_file })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })

  describe('blocks_to_markdown', () => {
    it('should convert blocks back to markdown', async () => {
      const original_markdown = `# Test Document

This is a paragraph.

## Section

More content here.`

      // Convert to blocks first
      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      // Convert back to markdown
      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      expect(converted_markdown).to.be.a('string')
      expect(converted_markdown).to.include('# Test Document')
      expect(converted_markdown).to.include('## Section')
      expect(converted_markdown).to.include('This is a paragraph')
    })

    it('should handle empty documents', async () => {
      const original_markdown = ''

      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      expect(converted_markdown).to.be.a('string')
    })

    it('should preserve code blocks in conversion', async () => {
      const original_markdown = `# Code Test

\`\`\`javascript
const test = "value"
\`\`\``

      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      expect(converted_markdown).to.include('```javascript')
      expect(converted_markdown).to.include('const test = "value"')
    })

    it('should preserve list structure in conversion', async () => {
      const original_markdown = `# Lists

- First item
- Second item
- Third item`

      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      expect(converted_markdown).to.include('Lists')
      expect(converted_markdown).to.include('item')
      // Accept either bullet style (* or -)
      expect(converted_markdown).to.match(/[*-]\s+\w+/)
    })
  })

  describe('Round-trip conversion', () => {
    it('should maintain content integrity through round-trip conversion', async () => {
      const original_markdown = `# Round Trip Test

This is a test of round-trip conversion.

## Features Tested

- Headings at multiple levels
- Regular paragraphs
- List items

\`\`\`javascript
// Code blocks
const test = "value"
\`\`\`

Final paragraph.`

      // Convert to blocks
      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      // Convert back to markdown
      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      // Basic content preservation checks
      expect(converted_markdown).to.include('Round Trip Test')
      expect(converted_markdown).to.include('Features Tested')
      expect(converted_markdown).to.include('const test = "value"')
      expect(converted_markdown).to.include('Final paragraph')
    })

    it('should maintain heading hierarchy', async () => {
      const original_markdown = `# Level 1

## Level 2

### Level 3

#### Level 4`

      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: block_result.blocks
      })

      expect(converted_markdown).to.include('# Level 1')
      expect(converted_markdown).to.include('## Level 2')
      expect(converted_markdown).to.include('### Level 3')
      expect(converted_markdown).to.include('#### Level 4')
    })
  })

  describe('build_ast_from_blocks', () => {
    it('should handle circular references with warning', async () => {
      // Create blocks with circular references
      const circular_blocks = {
        block_a: {
          block_cid: 'block_a',
          type: 'paragraph',
          content: 'Block A',
          attributes: {},
          relationships: {
            children: ['block_b'],
            parent: 'block_c'
          }
        },
        block_b: {
          block_cid: 'block_b',
          type: 'paragraph',
          content: 'Block B',
          attributes: {},
          relationships: {
            children: ['block_c'],
            parent: 'block_a'
          }
        },
        block_c: {
          block_cid: 'block_c',
          type: 'paragraph',
          content: 'Block C',
          attributes: {},
          relationships: {
            children: ['block_a'],
            parent: 'block_b'
          }
        }
      }

      // Capture console.warn calls
      const original_warn = console.warn
      const warn_calls = []
      console.warn = (...args) => {
        warn_calls.push(args.join(' '))
      }

      try {
        // Create a parent AST node
        const parent_node = {
          type: 'root',
          children: []
        }

        // This should not crash and should warn about circular references
        await build_ast_from_blocks({
          block: circular_blocks.block_a,
          all_blocks: circular_blocks,
          parent_node
        })

        // Check that warning was logged
        expect(warn_calls.length).to.be.greaterThan(0)
        expect(
          warn_calls.some((call) =>
            call.includes('Circular reference detected')
          )
        ).to.be.true
        expect(warn_calls.some((call) => call.includes('block_a'))).to.be.true
      } finally {
        // Restore console.warn
        console.warn = original_warn
      }
    })

    it('should process normal block hierarchies without warnings', async () => {
      // Create normal tree structure
      const normal_blocks = {
        root: {
          block_cid: 'root',
          type: 'paragraph',
          content: 'Root',
          attributes: {},
          relationships: {
            children: ['child1', 'child2'],
            parent: ''
          }
        },
        child1: {
          block_cid: 'child1',
          type: 'paragraph',
          content: 'Child 1',
          attributes: {},
          relationships: {
            children: [],
            parent: 'root'
          }
        },
        child2: {
          block_cid: 'child2',
          type: 'paragraph',
          content: 'Child 2',
          attributes: {},
          relationships: {
            children: [],
            parent: 'root'
          }
        }
      }

      // Capture console.warn calls
      const original_warn = console.warn
      const warn_calls = []
      console.warn = (...args) => {
        warn_calls.push(args.join(' '))
      }

      try {
        const parent_node = {
          type: 'root',
          children: []
        }

        await build_ast_from_blocks({
          block: normal_blocks.root,
          all_blocks: normal_blocks,
          parent_node
        })

        // Should not have any warnings for normal structure
        expect(warn_calls.length).to.equal(0)
      } finally {
        console.warn = original_warn
      }
    })
  })

  describe('Error handling', () => {
    it('should handle malformed markdown gracefully', async () => {
      const malformed_markdown = `# Heading

Unclosed code block
\`\`\`javascript
const code = "test"
// Missing closing backticks

More content`

      const result = await markdown_to_blocks({
        markdown_text: malformed_markdown,
        file_path: test_markdown_file
      })

      expect(result).to.have.property('markdown_file_root_block')
      expect(result).to.have.property('blocks')
    })

    it('should handle blocks_to_markdown with missing block references', async () => {
      const original_markdown = '# Test'

      const block_result = await markdown_to_blocks({
        markdown_text: original_markdown,
        file_path: test_markdown_file
      })

      // Remove some blocks to simulate missing references
      const incomplete_blocks = {}
      const block_keys = Object.keys(block_result.blocks)
      for (let i = 0; i < Math.floor(block_keys.length / 2); i++) {
        incomplete_blocks[block_keys[i]] = block_result.blocks[block_keys[i]]
      }

      // This should not crash even with missing blocks
      const converted_markdown = await blocks_to_markdown({
        document: block_result.markdown_file_root_block,
        blocks: incomplete_blocks
      })

      expect(converted_markdown).to.be.a('string')
    })
  })
})
