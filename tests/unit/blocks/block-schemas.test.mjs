import { expect } from 'chai'

import {
  BLOCK_TYPES,
  BASE_BLOCK,
  MARKDOWN_FILE_BLOCK,
  HEADING_BLOCK,
  PARAGRAPH_BLOCK,
  LIST_BLOCK,
  LIST_ITEM_BLOCK,
  CODE_BLOCK,
  BLOCKQUOTE_BLOCK,
  THEMATIC_BREAK_BLOCK,
  IMAGE_BLOCK,
  HTML_BLOCK,
  create_block
} from '#libs-server/blocks/index.mjs'

describe('Block Schemas', () => {
  describe('BLOCK_TYPES', () => {
    it('should define all required block types', () => {
      expect(BLOCK_TYPES.MARKDOWN_FILE).to.equal('markdown_file')
      expect(BLOCK_TYPES.HEADING).to.equal('heading')
      expect(BLOCK_TYPES.PARAGRAPH).to.equal('paragraph')
      expect(BLOCK_TYPES.LIST).to.equal('list')
      expect(BLOCK_TYPES.LIST_ITEM).to.equal('list_item')
      expect(BLOCK_TYPES.CODE).to.equal('code')
      expect(BLOCK_TYPES.BLOCKQUOTE).to.equal('blockquote')
      expect(BLOCK_TYPES.THEMATIC_BREAK).to.equal('thematic_break')
      expect(BLOCK_TYPES.IMAGE).to.equal('image')
      expect(BLOCK_TYPES.HTML_BLOCK).to.equal('html_block')
    })

    it('should have unique values for all block types', () => {
      const values = Object.values(BLOCK_TYPES)
      const unique_values = new Set(values)

      expect(unique_values.size).to.equal(values.length)
    })
  })

  describe('BASE_BLOCK', () => {
    it('should have required base properties', () => {
      expect(BASE_BLOCK).to.have.property('block_cid')
      expect(BASE_BLOCK).to.have.property('type')
      expect(BASE_BLOCK).to.have.property('content')
      expect(BASE_BLOCK).to.have.property('metadata')
      expect(BASE_BLOCK).to.have.property('attributes')
      expect(BASE_BLOCK).to.have.property('relationships')
    })

    it('should have proper metadata structure', () => {
      expect(BASE_BLOCK.metadata).to.have.property('created_at')
      expect(BASE_BLOCK.metadata).to.have.property('updated_at')
      expect(BASE_BLOCK.metadata).to.have.property('user_public_key')
      expect(BASE_BLOCK.metadata).to.have.property('tags')
      expect(BASE_BLOCK.metadata).to.have.property('position')

      expect(BASE_BLOCK.metadata.position).to.have.property('start')
      expect(BASE_BLOCK.metadata.position).to.have.property('end')
      expect(BASE_BLOCK.metadata.position.start).to.have.property('line')
      expect(BASE_BLOCK.metadata.position.start).to.have.property('character')
    })

    it('should have proper relationships structure', () => {
      expect(BASE_BLOCK.relationships).to.have.property('parent')
      expect(BASE_BLOCK.relationships).to.have.property('children')
      expect(BASE_BLOCK.relationships).to.have.property('references')

      expect(BASE_BLOCK.relationships.children).to.be.an('array')
      expect(BASE_BLOCK.relationships.references).to.be.an('array')
    })
  })

  describe('Block Type Schemas', () => {
    it('should extend BASE_BLOCK correctly for MARKDOWN_FILE_BLOCK', () => {
      expect(MARKDOWN_FILE_BLOCK.type).to.equal(BLOCK_TYPES.MARKDOWN_FILE)
      expect(MARKDOWN_FILE_BLOCK).to.have.property('block_cid')
      expect(MARKDOWN_FILE_BLOCK).to.have.property('content')
      expect(MARKDOWN_FILE_BLOCK).to.have.property('metadata')
      expect(MARKDOWN_FILE_BLOCK).to.have.property('relationships')

      expect(MARKDOWN_FILE_BLOCK.attributes).to.have.property('title')
      expect(MARKDOWN_FILE_BLOCK.attributes).to.have.property('source_path')
    })

    it('should extend BASE_BLOCK correctly for HEADING_BLOCK', () => {
      expect(HEADING_BLOCK.type).to.equal(BLOCK_TYPES.HEADING)
      expect(HEADING_BLOCK.attributes).to.have.property('level')
      expect(HEADING_BLOCK.attributes).to.have.property('is_toggleable')
      expect(HEADING_BLOCK.attributes.level).to.equal(1)
      expect(HEADING_BLOCK.attributes.is_toggleable).to.equal(false)
    })

    it('should extend BASE_BLOCK correctly for PARAGRAPH_BLOCK', () => {
      expect(PARAGRAPH_BLOCK.type).to.equal(BLOCK_TYPES.PARAGRAPH)
      expect(PARAGRAPH_BLOCK.attributes).to.have.property('color')
      expect(PARAGRAPH_BLOCK.attributes.color).to.equal('default')
    })

    it('should extend BASE_BLOCK correctly for LIST_BLOCK', () => {
      expect(LIST_BLOCK.type).to.equal(BLOCK_TYPES.LIST)
      expect(LIST_BLOCK.attributes).to.have.property('ordered')
      expect(LIST_BLOCK.attributes).to.have.property('spread')
      expect(LIST_BLOCK.attributes).to.have.property('color')
      expect(LIST_BLOCK.attributes.ordered).to.equal(false)
      expect(LIST_BLOCK.attributes.spread).to.equal(false)
    })

    it('should extend BASE_BLOCK correctly for LIST_ITEM_BLOCK', () => {
      expect(LIST_ITEM_BLOCK.type).to.equal(BLOCK_TYPES.LIST_ITEM)
      expect(LIST_ITEM_BLOCK.attributes).to.have.property('indent_level')
      expect(LIST_ITEM_BLOCK.attributes).to.have.property('list_type')
      expect(LIST_ITEM_BLOCK.attributes).to.have.property('checked')
      expect(LIST_ITEM_BLOCK.attributes).to.have.property('color')
      expect(LIST_ITEM_BLOCK.attributes.indent_level).to.equal(0)
      expect(LIST_ITEM_BLOCK.attributes.list_type).to.equal('bullet')
      expect(LIST_ITEM_BLOCK.attributes.checked).to.equal(false)
    })

    it('should extend BASE_BLOCK correctly for CODE_BLOCK', () => {
      expect(CODE_BLOCK.type).to.equal(BLOCK_TYPES.CODE)
      expect(CODE_BLOCK.attributes).to.have.property('language')
      expect(CODE_BLOCK.attributes.language).to.equal('')
    })

    it('should extend BASE_BLOCK correctly for BLOCKQUOTE_BLOCK', () => {
      expect(BLOCKQUOTE_BLOCK.type).to.equal(BLOCK_TYPES.BLOCKQUOTE)
      expect(BLOCKQUOTE_BLOCK.attributes).to.have.property('color')
      expect(BLOCKQUOTE_BLOCK.attributes.color).to.equal('default')
    })

    it('should extend BASE_BLOCK correctly for THEMATIC_BREAK_BLOCK', () => {
      expect(THEMATIC_BREAK_BLOCK.type).to.equal(BLOCK_TYPES.THEMATIC_BREAK)
      // Thematic break has no specific attributes beyond base
    })

    it('should extend BASE_BLOCK correctly for IMAGE_BLOCK', () => {
      expect(IMAGE_BLOCK.type).to.equal(BLOCK_TYPES.IMAGE)
      expect(IMAGE_BLOCK.attributes).to.have.property('uri')
      expect(IMAGE_BLOCK.attributes).to.have.property('alt_text')
      expect(IMAGE_BLOCK.attributes).to.have.property('caption')
      expect(IMAGE_BLOCK.attributes).to.have.property('type')
      expect(IMAGE_BLOCK.attributes.type).to.equal('file')
    })

    it('should extend BASE_BLOCK correctly for HTML_BLOCK', () => {
      expect(HTML_BLOCK.type).to.equal(BLOCK_TYPES.HTML_BLOCK)
      // HTML block has no specific attributes beyond base
    })
  })

  describe('create_block function', () => {
    it('should create a basic paragraph block', () => {
      const block = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Test paragraph content'
      })

      expect(block.type).to.equal(BLOCK_TYPES.PARAGRAPH)
      expect(block.content).to.equal('Test paragraph content')
      expect(block.attributes.color).to.equal('default')
      expect(block.metadata.created_at).to.be.a('string')
      expect(block.metadata.updated_at).to.be.a('string')
      expect(block.relationships.children).to.be.an('array')
      expect(block.relationships.references).to.be.an('array')
    })

    it('should create a heading block with custom attributes', () => {
      const block = create_block({
        type: BLOCK_TYPES.HEADING,
        content: 'Test Heading',
        attributes: {
          level: 2,
          is_toggleable: true
        }
      })

      expect(block.type).to.equal(BLOCK_TYPES.HEADING)
      expect(block.content).to.equal('Test Heading')
      expect(block.attributes.level).to.equal(2)
      expect(block.attributes.is_toggleable).to.equal(true)
    })

    it('should create a code block with language attribute', () => {
      const block = create_block({
        type: BLOCK_TYPES.CODE,
        content: 'const foo = "bar"',
        attributes: {
          language: 'javascript'
        }
      })

      expect(block.type).to.equal(BLOCK_TYPES.CODE)
      expect(block.content).to.equal('const foo = "bar"')
      expect(block.attributes.language).to.equal('javascript')
    })

    it('should create a list item block with custom properties', () => {
      const block = create_block({
        type: BLOCK_TYPES.LIST_ITEM,
        content: 'List item content',
        attributes: {
          indent_level: 1,
          list_type: 'numbered',
          checked: true
        }
      })

      expect(block.type).to.equal(BLOCK_TYPES.LIST_ITEM)
      expect(block.content).to.equal('List item content')
      expect(block.attributes.indent_level).to.equal(1)
      expect(block.attributes.list_type).to.equal('numbered')
      expect(block.attributes.checked).to.equal(true)
    })

    it('should create block with custom metadata', () => {
      const custom_metadata = {
        user_public_key: 'test-user-123',
        tags: ['tag1', 'tag2'],
        position: {
          start: { line: 5, character: 10 },
          end: { line: 5, character: 30 }
        }
      }

      const block = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Test content',
        metadata: custom_metadata
      })

      expect(block.metadata.user_public_key).to.equal('test-user-123')
      expect(block.metadata.tags).to.deep.equal(['tag1', 'tag2'])
      expect(block.metadata.position.start.line).to.equal(5)
      expect(block.metadata.position.start.character).to.equal(10)
      expect(block.metadata.position.end.line).to.equal(5)
      expect(block.metadata.position.end.character).to.equal(30)
    })

    it('should create block with custom relationships', () => {
      const relationships = {
        parent: 'parent-block-cid',
        children: ['child1-cid', 'child2-cid'],
        references: ['ref1-cid', 'ref2-cid']
      }

      const block = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Test content',
        relationships
      })

      expect(block.relationships.parent).to.equal('parent-block-cid')
      expect(block.relationships.children).to.deep.equal([
        'child1-cid',
        'child2-cid'
      ])
      expect(block.relationships.references).to.deep.equal([
        'ref1-cid',
        'ref2-cid'
      ])
    })

    it('should create a markdown file block with file attributes', () => {
      const block = create_block({
        type: BLOCK_TYPES.MARKDOWN_FILE,
        content: '# Document Title\n\nContent...',
        attributes: {
          title: 'My Document',
          source_path: '/path/to/document.md'
        }
      })

      expect(block.type).to.equal(BLOCK_TYPES.MARKDOWN_FILE)
      expect(block.attributes.title).to.equal('My Document')
      expect(block.attributes.source_path).to.equal('/path/to/document.md')
    })

    it('should handle unknown block types gracefully', () => {
      const block = create_block({
        type: 'unknown_type',
        content: 'Test content'
      })

      expect(block.type).to.equal('unknown_type')
      expect(block.content).to.equal('Test content')
      expect(block.metadata.created_at).to.be.a('string')
      expect(block.metadata.updated_at).to.be.a('string')
    })

    it('should set timestamps on block creation', () => {
      const block = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Test content'
      })

      // Check that timestamps are valid ISO strings
      expect(block.metadata.created_at).to.be.a('string')
      expect(block.metadata.updated_at).to.be.a('string')

      // Check that they can be parsed as valid dates
      const created_date = new Date(block.metadata.created_at)
      const updated_date = new Date(block.metadata.updated_at)

      expect(created_date.getTime()).to.not.be.NaN
      expect(updated_date.getTime()).to.not.be.NaN

      // Check that they are recent (within last 5 seconds)
      const now = new Date()
      expect(now.getTime() - created_date.getTime()).to.be.lessThan(5000)
      expect(now.getTime() - updated_date.getTime()).to.be.lessThan(5000)
    })

    it('should ensure relationship arrays are separate instances', () => {
      const block1 = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Block 1'
      })

      const block2 = create_block({
        type: BLOCK_TYPES.PARAGRAPH,
        content: 'Block 2'
      })

      // Modify one block's relationships
      block1.relationships.children.push('child-cid')
      block1.relationships.references.push('ref-cid')

      // Other block should not be affected
      expect(block2.relationships.children).to.have.length(0)
      expect(block2.relationships.references).to.have.length(0)
    })

    it('should merge default attributes with custom attributes', () => {
      const block = create_block({
        type: BLOCK_TYPES.HEADING,
        content: 'Custom Heading',
        attributes: {
          level: 3
          // is_toggleable should still be the default false
        }
      })

      expect(block.attributes.level).to.equal(3)
      expect(block.attributes.is_toggleable).to.equal(false)
    })

    it('should handle empty content gracefully', () => {
      const block = create_block({
        type: BLOCK_TYPES.PARAGRAPH
        // No content provided
      })

      expect(block.content).to.equal('')
      expect(block.type).to.equal(BLOCK_TYPES.PARAGRAPH)
    })
  })

  describe('Schema consistency', () => {
    it('should ensure all block schemas inherit from BASE_BLOCK', () => {
      const schemas = [
        MARKDOWN_FILE_BLOCK,
        HEADING_BLOCK,
        PARAGRAPH_BLOCK,
        LIST_BLOCK,
        LIST_ITEM_BLOCK,
        CODE_BLOCK,
        BLOCKQUOTE_BLOCK,
        THEMATIC_BREAK_BLOCK,
        IMAGE_BLOCK,
        HTML_BLOCK
      ]

      for (const schema of schemas) {
        expect(schema).to.have.property('block_cid')
        expect(schema).to.have.property('type')
        expect(schema).to.have.property('content')
        expect(schema).to.have.property('metadata')
        expect(schema).to.have.property('attributes')
        expect(schema).to.have.property('relationships')
      }
    })

    it('should have valid block types for all schemas', () => {
      const type_values = Object.values(BLOCK_TYPES)

      expect(type_values).to.include(MARKDOWN_FILE_BLOCK.type)
      expect(type_values).to.include(HEADING_BLOCK.type)
      expect(type_values).to.include(PARAGRAPH_BLOCK.type)
      expect(type_values).to.include(LIST_BLOCK.type)
      expect(type_values).to.include(LIST_ITEM_BLOCK.type)
      expect(type_values).to.include(CODE_BLOCK.type)
      expect(type_values).to.include(BLOCKQUOTE_BLOCK.type)
      expect(type_values).to.include(THEMATIC_BREAK_BLOCK.type)
      expect(type_values).to.include(IMAGE_BLOCK.type)
      expect(type_values).to.include(HTML_BLOCK.type)
    })
  })
})
