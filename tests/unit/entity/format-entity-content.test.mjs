import { expect } from 'chai'
import { v4 as uuid } from 'uuid'
import { format_entity_properties_to_frontmatter } from '#libs-server/entity/format/index.mjs'

describe('Entity Content Formatting', () => {
  describe('format_entity_properties_to_frontmatter', () => {
    it('should format base entity fields correctly', () => {
      const entity_properties = {
        entity_id: uuid(),
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        tags: ['tag1', 'tag2'],
        permalink: '/test'
      }

      const result = format_entity_properties_to_frontmatter({
        entity_properties,
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
      const created_at = '2023-01-01T00:00:00.000Z'
      const entity_properties = {
        entity_id: uuid(),
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        created_at
      }

      const result = format_entity_properties_to_frontmatter({
        entity_properties,
        entity_type: 'test'
      })

      expect(result.created_at).to.equal(created_at)
      expect(result.updated_at).to.not.equal(created_at) // Should be current time
    })

    it('should include all optional base fields when provided', () => {
      const entity_properties = {
        entity_id: uuid(),
        title: 'Test Entity',
        description: 'Test description',
        user_id: '123456',
        permalink: '/test',
        tags: ['tag1', 'tag2'],
        relations: ['relates_to [[entity/test]]'],
        observations: ['[note] Test observation'],
        archived_at: '2023-02-01T00:00:00.000Z'
      }

      const result = format_entity_properties_to_frontmatter({
        entity_properties,
        entity_type: 'test'
      })

      expect(result.permalink).to.equal('/test')
      expect(result.tags).to.deep.equal(['tag1', 'tag2'])
      expect(result.relations).to.deep.equal(['relates_to [[entity/test]]'])
      expect(result.observations).to.deep.equal(['[note] Test observation'])
      expect(result.archived_at).to.equal('2023-02-01T00:00:00.000Z')
    })

    it('should include custom fields for extended entity types', () => {
      const entity_properties = {
        entity_id: uuid(),
        title: 'Test Task',
        description: 'Test description',
        user_id: '123456',
        status: 'In Progress',
        priority: 'High',
        start_by: '2023-03-01T00:00:00.000Z',
        finish_by: '2023-03-15T00:00:00.000Z',
        custom_field: 'custom value'
      }

      const result = format_entity_properties_to_frontmatter({
        entity_properties,
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
        format_entity_properties_to_frontmatter({
          entity_properties: {
            description: 'Test description',
            user_id: '123456'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity title is required')

      // Missing description
      expect(() =>
        format_entity_properties_to_frontmatter({
          entity_properties: {
            title: 'Test Entity',
            user_id: '123456'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity description is required')

      // Missing user_id
      expect(() =>
        format_entity_properties_to_frontmatter({
          entity_properties: {
            title: 'Test Entity',
            description: 'Test description'
          },
          entity_type: 'test'
        })
      ).to.throw('Entity user_id is required')
    })
  })
})
