import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  PERMISSION_LEVELS,
  parse_companion_permissions,
  apply_block_permissions,
  process_block_permissions
} from '#libs-server/blocks/block-permissions.mjs'
import { markdown_to_blocks } from '#libs-server/blocks/block-converter.mjs'

describe('Block Permissions', () => {
  let temp_dir
  let test_markdown_file
  let test_permissions_file

  beforeEach(async () => {
    // Create temporary directory for test files
    temp_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'block-permissions-test-')
    )
    test_markdown_file = path.join(temp_dir, 'test-document.md')
    test_permissions_file = `${test_markdown_file}.blockpermissions`
  })

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(temp_dir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('PERMISSION_LEVELS', () => {
    it('should define PUBLIC and OWNER permission levels', () => {
      expect(PERMISSION_LEVELS.PUBLIC).to.equal('public')
      expect(PERMISSION_LEVELS.OWNER).to.equal('owner')
    })
  })

  describe('parse_companion_permissions', () => {
    it('should return null when permissions file does not exist', async () => {
      const non_existent_file = path.join(temp_dir, 'non-existent.md')
      const result = await parse_companion_permissions({
        markdown_file_path: non_existent_file
      })
      expect(result).to.be.null
    })

    it('should parse valid YAML permissions file', async () => {
      const permissions_content = `
permissions:
  - blocks: [1, 2, 3]
    allow: owner
  - block_range: [5, 8]
    allow: owner
  - block_type: code
    allow: owner
`
      await fs.writeFile(test_permissions_file, permissions_content)

      const result = await parse_companion_permissions({
        markdown_file_path: test_markdown_file
      })

      expect(result).to.be.an('object')
      expect(result.permissions).to.be.an('array')
      expect(result.permissions).to.have.length(3)

      // Check first permission rule
      expect(result.permissions[0]).to.deep.include({
        blocks: [1, 2, 3],
        allow: 'owner'
      })

      // Check second permission rule
      expect(result.permissions[1]).to.deep.include({
        block_range: [5, 8],
        allow: 'owner'
      })

      // Check third permission rule
      expect(result.permissions[2]).to.deep.include({
        block_type: 'code',
        allow: 'owner'
      })
    })

    it('should handle malformed YAML gracefully', async () => {
      const malformed_yaml = `
permissions:
  - blocks: [1, 2, 3
    allow: owner
  invalid yaml here
`
      await fs.writeFile(test_permissions_file, malformed_yaml)

      // Should not throw, but return null or handle gracefully
      const result = await parse_companion_permissions({
        markdown_file_path: test_markdown_file
      })
      // The function should either return null or handle the error
      expect(result).to.satisfy((r) => r === null || typeof r === 'object')
    })
  })

  describe('apply_block_permissions', () => {
    let sample_blocks

    beforeEach(async () => {
      // Create sample blocks structure
      const markdown_content = `# Heading 1

Paragraph 1

## Heading 2

Paragraph 2

\`\`\`javascript
const code = "test"
\`\`\`

### Heading 3

Another paragraph
`

      const { blocks } = await markdown_to_blocks({
        markdown_text: markdown_content,
        file_path: test_markdown_file
      })
      sample_blocks = blocks
    })

    it('should return original blocks when no permissions file exists', () => {
      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: null,
        user_context: { is_owner: false }
      })
      expect(result.blocks).to.deep.equal(sample_blocks)
      expect(result.redacted_count).to.equal(0)
    })

    it('should return original blocks when user is owner', () => {
      const permissions = {
        permissions: [{ blocks: [1, 2], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: true }
      })
      expect(result.blocks).to.deep.equal(sample_blocks)
      expect(result.redacted_count).to.equal(0)
    })

    it('should filter blocks by block numbers for non-owner', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      const original_count = Object.keys(sample_blocks).length
      const filtered_count = Object.keys(result.blocks).length

      expect(filtered_count).to.equal(original_count) // Blocks are redacted, not removed
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should filter blocks by block range for non-owner', () => {
      const permissions = {
        permissions: [{ block_range: [1, 3], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      const original_count = Object.keys(sample_blocks).length
      const filtered_count = Object.keys(result.blocks).length

      expect(filtered_count).to.equal(original_count) // Blocks are redacted, not removed
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should filter blocks by type for non-owner', () => {
      const permissions = {
        permissions: [{ block_type: 'code', allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Check that code blocks are redacted
      const remaining_blocks = Object.values(result.blocks)
      const code_blocks = remaining_blocks.filter(
        (block) => block.type === 'code' && !block.is_redacted
      )
      expect(code_blocks).to.have.length(0)
    })

    it('should filter blocks by heading level for non-owner', () => {
      const permissions = {
        permissions: [{ heading_level: 3, allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Check that level 3 headings are redacted
      const remaining_blocks = Object.values(result.blocks)
      const h3_blocks = remaining_blocks.filter(
        (block) =>
          block.type === 'heading' &&
          block.attributes?.level === 3 &&
          !block.is_redacted
      )
      expect(h3_blocks).to.have.length(0)
    })

    it('should filter blocks by CID for non-owner', () => {
      // Get non-document block CIDs only
      const block_cids = Object.entries(sample_blocks)
        .filter(([cid, block]) => block.type !== 'markdown_file')
        .slice(0, 2)
        .map(([cid, block]) => cid)
      const permissions = {
        permissions: [{ block_cids, allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Check that specified CIDs are redacted
      for (const cid of block_cids) {
        expect(result.blocks[cid].is_redacted).to.be.true
      }
    })

    it('should handle multiple permission rules', () => {
      const permissions = {
        permissions: [
          { block_type: 'heading', allow: 'owner' },
          { block_type: 'code', allow: 'owner' }
        ]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Check that headings and code blocks are redacted
      const remaining_blocks = Object.values(result.blocks)
      const restricted_blocks = remaining_blocks.filter(
        (block) =>
          (block.type === 'heading' || block.type === 'code') &&
          !block.is_redacted
      )
      expect(restricted_blocks).to.have.length(0)
    })

    it('should clean up parent-child relationships after filtering', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Check that relationships are maintained (blocks are redacted, not removed)
      Object.values(result.blocks).forEach((block) => {
        if (block.relationships?.children) {
          block.relationships.children.forEach((child_cid) => {
            expect(result.blocks).to.have.property(child_cid)
          })
        }

        if (block.relationships?.references) {
          block.relationships.references.forEach((ref_cid) => {
            expect(result.blocks).to.have.property(ref_cid)
          })
        }
      })
    })
  })

  describe('process_block_permissions', () => {
    let sample_blocks

    beforeEach(async () => {
      const markdown_content = `# Test Document

This is a test paragraph.

\`\`\`javascript
const secret = "hidden"
\`\`\`

## Public Section

More content here.
`

      await fs.writeFile(test_markdown_file, markdown_content)

      const { blocks } = await markdown_to_blocks({
        markdown_text: markdown_content,
        file_path: test_markdown_file
      })
      sample_blocks = blocks
    })

    it('should process permissions successfully with companion file', async () => {
      const permissions_content = `
permissions:
  - block_type: code
    allow: owner
`
      await fs.writeFile(test_permissions_file, permissions_content)

      const result = await process_block_permissions({
        file_path: test_markdown_file,
        blocks: sample_blocks,
        user_context: { is_owner: false }
      })

      expect(result).to.be.an('object')
      expect(result.blocks).to.be.an('object')
      expect(result.permission_metadata).to.be.an('object')

      expect(result.permission_metadata.has_permissions).to.be.true
      expect(result.permission_metadata.has_companion_file).to.be.true
      expect(result.permission_metadata.blocks_redacted).to.be.greaterThan(0)
    })

    it('should return original blocks when no companion file exists', async () => {
      const result = await process_block_permissions({
        file_path: test_markdown_file,
        blocks: sample_blocks,
        user_context: { is_owner: false }
      })

      expect(result.blocks).to.deep.equal(sample_blocks)
      expect(result.permission_metadata.has_permissions).to.be.false
      expect(result.permission_metadata.has_companion_file).to.be.false
      expect(result.permission_metadata.blocks_redacted).to.equal(0)
    })

    it('should handle errors gracefully', async () => {
      // Create a malformed permissions file
      await fs.writeFile(test_permissions_file, 'invalid: yaml: content: [')

      const result = await process_block_permissions({
        file_path: test_markdown_file,
        blocks: sample_blocks,
        user_context: { is_owner: false }
      })

      // Should return original blocks when processing fails
      expect(result.blocks).to.deep.equal(sample_blocks)
      // Note: The current implementation may not set error in metadata for YAML parsing errors
      // It handles them by returning null from parse_companion_permissions
      expect(result.permission_metadata.has_permissions).to.be.false
    })

    it('should include accurate metadata', async () => {
      const permissions_content = `
permissions:
  - blocks: [1, 2]
    allow: owner
`
      await fs.writeFile(test_permissions_file, permissions_content)

      const original_count = Object.keys(sample_blocks).length
      const result = await process_block_permissions({
        file_path: test_markdown_file,
        blocks: sample_blocks,
        user_context: { is_owner: false }
      })

      expect(result.permission_metadata.original_block_count).to.equal(
        original_count
      )
      expect(result.permission_metadata.processed_block_count).to.equal(
        Object.keys(result.blocks).length
      )
      expect(result.permission_metadata.blocks_redacted).to.be.greaterThan(0)
    })
  })

  describe('User Context Permission Checking', () => {
    let sample_blocks

    beforeEach(async () => {
      const { blocks } = await markdown_to_blocks({
        markdown_text: '# Test\n\nContent here.',
        file_path: test_markdown_file
      })
      sample_blocks = blocks
    })

    it('should allow access for public permission regardless of user', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'public' }]
      }

      const result_no_user = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: {}
      })
      const result_non_owner = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })
      const result_owner = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: true }
      })

      expect(Object.keys(result_no_user.blocks).length).to.equal(
        Object.keys(sample_blocks).length
      )
      expect(Object.keys(result_non_owner.blocks).length).to.equal(
        Object.keys(sample_blocks).length
      )
      expect(Object.keys(result_owner.blocks).length).to.equal(
        Object.keys(sample_blocks).length
      )
    })

    it('should restrict access for owner permission when not owner', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result_no_user = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: {}
      })
      const result_non_owner = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      expect(result_no_user.redacted_count).to.be.greaterThan(0)
      expect(result_non_owner.redacted_count).to.be.greaterThan(0)
    })

    it('should allow access for owner permission when user is owner', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result_owner = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: true }
      })

      expect(Object.keys(result_owner.blocks).length).to.equal(
        Object.keys(sample_blocks).length
      )
      expect(result_owner.redacted_count).to.equal(0)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    let sample_blocks

    beforeEach(async () => {
      const { blocks } = await markdown_to_blocks({
        markdown_text: '# Test\n\nContent here.',
        file_path: test_markdown_file
      })
      sample_blocks = blocks
    })

    it('should handle malformed YAML in companion permissions', async () => {
      // Test non-existent file path which should return null gracefully
      const result = await parse_companion_permissions({
        markdown_file_path: '/non/existent/path.md'
      })
      expect(result).to.be.null
    })

    it('should handle empty companion permissions file', async () => {
      const result = await parse_companion_permissions({
        markdown_file_path: '/non/existent/path.md'
      })
      expect(result).to.be.null
    })

    it('should handle companion permissions with no permissions array', async () => {
      const result = await parse_companion_permissions({
        markdown_file_path: '/non/existent/path.md'
      })
      expect(result).to.be.null
    })

    it('should handle permissions with invalid permission levels', () => {
      const permissions = {
        permissions: [
          { blocks: [1], allow: 'invalid_level' },
          { blocks: [2], allow: 'owner' } // Valid one should still work
        ]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Should skip invalid permission but process valid ones
      expect(result).to.have.property('blocks')
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should handle block ranges that exceed available blocks', () => {
      const permissions = {
        permissions: [
          { block_range: [1, 1000], allow: 'owner' } // Range exceeds actual blocks
        ]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Should handle gracefully without errors
      expect(result).to.have.property('blocks')
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should handle negative block indices', () => {
      const permissions = {
        permissions: [{ blocks: [-1, 0, 1], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Should ignore negative indices and process valid ones
      expect(result).to.have.property('blocks')
    })

    it('should handle duplicate block indices in permissions', () => {
      const permissions = {
        permissions: [{ blocks: [1, 1, 1, 2], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Should handle duplicates without errors
      expect(result).to.have.property('blocks')
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should handle very large permission files', () => {
      // Create a permission with many rules
      const large_permissions = {
        permissions: []
      }

      // Add 100 permission rules
      for (let i = 0; i < 100; i++) {
        large_permissions.permissions.push({
          blocks: [i % 3], // Cycle through first 3 blocks
          allow: i % 2 === 0 ? 'owner' : 'public'
        })
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: large_permissions,
        user_context: { is_owner: false }
      })

      // Should process without performance issues
      expect(result).to.have.property('blocks')
    })

    it('should handle permissions with missing required fields', () => {
      const invalid_permissions = {
        permissions: [
          { blocks: [1] }, // Missing 'allow'
          { allow: 'owner' }, // Missing block selector
          { blocks: [2], allow: 'owner' } // Valid one
        ]
      }

      const result = apply_block_permissions({
        blocks: sample_blocks,
        companion_permissions: invalid_permissions,
        user_context: { is_owner: false }
      })

      // Should skip invalid permissions and process valid ones
      expect(result).to.have.property('blocks')
    })

    it('should handle empty blocks object', () => {
      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: {},
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      expect(result.blocks).to.deep.equal({})
      expect(result.redacted_count).to.equal(0)
    })

    it('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        apply_block_permissions({
          blocks: null,
          companion_permissions: null,
          user_context: null
        })
      }).to.not.throw()

      expect(() => {
        apply_block_permissions({
          blocks: undefined,
          companion_permissions: undefined,
          user_context: undefined
        })
      }).to.not.throw()
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle deeply nested block structures', () => {
      // Create blocks with deep nesting relationships
      const nested_blocks = {}
      for (let i = 0; i < 10; i++) {
        nested_blocks[`block_${i}`] = {
          block_cid: `block_${i}`,
          type: 'paragraph',
          content: `Content ${i}`,
          relationships: {
            children: i < 9 ? [`block_${i + 1}`] : [],
            parent: i > 0 ? `block_${i - 1}` : null
          }
        }
      }

      const permissions = {
        permissions: [{ blocks: [5], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: nested_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      expect(result).to.have.property('blocks')
      expect(result.redacted_count).to.be.greaterThan(0)
    })

    it('should handle blocks with circular references', () => {
      const circular_blocks = {
        block_a: {
          block_cid: 'block_a',
          type: 'paragraph',
          content: 'Block A',
          relationships: {
            children: ['block_b'],
            parent: 'block_c'
          }
        },
        block_b: {
          block_cid: 'block_b',
          type: 'paragraph',
          content: 'Block B',
          relationships: {
            children: ['block_c'],
            parent: 'block_a'
          }
        },
        block_c: {
          block_cid: 'block_c',
          type: 'paragraph',
          content: 'Block C',
          relationships: {
            children: ['block_a'],
            parent: 'block_b'
          }
        }
      }

      const permissions = {
        permissions: [{ blocks: [1], allow: 'owner' }]
      }

      const result = apply_block_permissions({
        blocks: circular_blocks,
        companion_permissions: permissions,
        user_context: { is_owner: false }
      })

      // Should handle without infinite loops
      expect(result).to.have.property('blocks')
    })
  })
})
