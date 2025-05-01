import { expect } from 'chai'
import {
  format_entity_file_content,
  format_entity_frontmatter
} from '#libs-server/entity/format-entity-content.mjs'

describe('Entity Content Formatting', () => {
  describe('format_entity_file_content', () => {
    it('should format frontmatter and content correctly', () => {
      const frontmatter = {
        title: 'Test Entity',
        type: 'test',
        description: 'Test description',
        tags: ['tag1', 'tag2']
      }
      const content = 'This is the content'

      const result = format_entity_file_content({
        frontmatter,
        content
      })

      expect(result).to.include('---')
      expect(result).to.include('title: "Test Entity"')
      expect(result).to.include('type: "test"')
      expect(result).to.include('description: "Test description"')
      expect(result).to.include('tags:')
      expect(result).to.include('  - "tag1"')
      expect(result).to.include('  - "tag2"')
      expect(result).to.include('This is the content')
    })

    it('should handle empty content', () => {
      const frontmatter = {
        title: 'Test Entity',
        type: 'test',
        description: 'Test description'
      }

      const result = format_entity_file_content({
        frontmatter,
        content: ''
      })

      expect(result).to.include('---')
      expect(result).to.include('title: "Test Entity"')
      expect(result).to.match(/---\n\n$/m) // Should end with --- followed by blank line
    })

    it('should handle arrays and objects in frontmatter', () => {
      const frontmatter = {
        title: 'Test Entity',
        type: 'test',
        description: 'Test description',
        tags: ['tag1', 'tag2'],
        metadata: { key1: 'value1', key2: 'value2' }
      }

      const result = format_entity_file_content({
        frontmatter,
        content: 'Content'
      })

      expect(result).to.include('tags:')
      expect(result).to.include('  - "tag1"')
      expect(result).to.include('  - "tag2"')
      expect(result).to.include('metadata:')
      expect(result).to.include('  key1: "value1"')
      expect(result).to.include('  key2: "value2"')
    })

    it('should handle status field without quotes', () => {
      const frontmatter = {
        title: 'Test Entity',
        type: 'test',
        description: 'Test description',
        status: 'In Progress'
      }

      const result = format_entity_file_content({
        frontmatter,
        content: 'Content'
      })

      expect(result).to.include('status: In Progress') // No quotes
      expect(result).to.include('title: "Test Entity"') // With quotes
    })

    it('should throw error if frontmatter is invalid', () => {
      expect(() =>
        format_entity_file_content({
          frontmatter: null,
          content: 'Content'
        })
      ).to.throw('Frontmatter must be a valid object')

      expect(() =>
        format_entity_file_content({
          frontmatter: 'not an object',
          content: 'Content'
        })
      ).to.throw('Frontmatter must be a valid object')
    })
  })

  describe('format_entity_frontmatter', () => {
    it('should format base entity fields correctly', () => {
      const entity_data = {
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        tags: ['tag1', 'tag2'],
        permalink: '/test'
      }

      const result = format_entity_frontmatter({
        entity_data,
        entity_type: 'test'
      })

      expect(result.title).to.equal('Test Entity')
      expect(result.type).to.equal('test')
      expect(result.description).to.equal('Test description')
      expect(result.user_id).to.equal('123456')
      expect(result.tags).to.deep.equal(['tag1', 'tag2'])
      expect(result.permalink).to.equal('/test')
      expect(result.created_at).to.be.a('string')
      expect(result.updated_at).to.be.a('string')
    })

    it('should use existing created_at when provided', () => {
      const created_time = '2023-01-01T00:00:00.000Z'
      const entity_data = {
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        created_at: created_time
      }

      const result = format_entity_frontmatter({
        entity_data,
        entity_type: 'test'
      })

      expect(result.created_at).to.equal(created_time)
      expect(result.updated_at).to.not.equal(created_time) // Should be current time
    })

    it('should include all optional base fields when provided', () => {
      const entity_data = {
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        permalink: '/test',
        tags: ['tag1', 'tag2'],
        relations: ['relates_to [[entity/test]]'],
        observations: ['[note] Test observation'],
        archived_at: '2023-02-01T00:00:00.000Z'
      }

      const result = format_entity_frontmatter({
        entity_data,
        entity_type: 'test'
      })

      expect(result.permalink).to.equal('/test')
      expect(result.tags).to.deep.equal(['tag1', 'tag2'])
      expect(result.relations).to.deep.equal(['relates_to [[entity/test]]'])
      expect(result.observations).to.deep.equal(['[note] Test observation'])
      expect(result.archived_at).to.equal('2023-02-01T00:00:00.000Z')
    })

    it('should include custom fields for extended entity types', () => {
      const entity_data = {
        title: 'Test Task',
        description: 'Test description',
        user_id: '123456',
        status: 'In Progress',
        priority: 'High',
        start_by: '2023-03-01T00:00:00.000Z',
        finish_by: '2023-03-15T00:00:00.000Z',
        custom_field: 'custom value'
      }

      const result = format_entity_frontmatter({
        entity_data,
        entity_type: 'task'
      })

      expect(result.title).to.equal('Test Task')
      expect(result.type).to.equal('task')
      expect(result.status).to.equal('In Progress')
      expect(result.priority).to.equal('High')
      expect(result.start_by).to.equal('2023-03-01T00:00:00.000Z')
      expect(result.finish_by).to.equal('2023-03-15T00:00:00.000Z')
      expect(result.custom_field).to.equal('custom value')
    })

    it('should throw error if required fields are missing', () => {
      // Missing title
      expect(() =>
        format_entity_frontmatter({
          entity_data: {
            description: 'Test description',
            user_id: '123456'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity title is required')

      // Missing description
      expect(() =>
        format_entity_frontmatter({
          entity_data: {
            title: 'Test Entity',
            user_id: '123456'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity description is required')

      // Missing user_id
      expect(() =>
        format_entity_frontmatter({
          entity_data: {
            title: 'Test Entity',
            description: 'Test description'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity user_id is required')
    })
  })
})
