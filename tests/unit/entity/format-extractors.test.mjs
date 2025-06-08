import { expect } from 'chai'
import {
  extract_entity_tags,
  extract_entity_relations,
  extract_entity_observations
} from '#libs-server/entity/format/index.mjs'

describe('Entity Format Extractors', () => {
  describe('extract_entity_tags', () => {
    it('should extract tags from frontmatter', () => {
      const entity_properties = {
        tags: [
          'sys:system/development',
          'sys:system/javascript',
          'sys:system/testing'
        ]
      }

      const tags = extract_entity_tags({ entity_properties })

      expect(tags.property_tags).to.be.an('array')
      expect(tags.property_tags).to.have.lengthOf(3)
      expect(tags.property_tags[0]).to.deep.include({
        base_uri: 'sys:system/development'
      })
      expect(tags.property_tags[1]).to.deep.include({
        base_uri: 'sys:system/javascript'
      })
      expect(tags.property_tags[2]).to.deep.include({
        base_uri: 'sys:system/testing'
      })
    })

    it('should handle empty tags properly', () => {
      const entity_properties = {}
      const entity_content = 'Just some plain text without hashtags.'

      const tags = extract_entity_tags({ entity_properties, entity_content })

      expect(tags.property_tags).to.be.an('array')
      expect(tags.property_tags).to.have.lengthOf(0)
    })
  })

  describe('extract_entity_relations', () => {
    it('should extract basic relations from entity properties', () => {
      const entity_properties = {
        relations: [
          'depends_on [[sys:system/project-setup]]',
          'blocked_by [[sys:system/server-configuration]]',
          'related_to [[sys:system/api-documentation]]'
        ]
      }

      const relations = extract_entity_relations({ entity_properties })

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        base_uri: 'sys:system/project-setup',
        context: null
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'sys:system/server-configuration',
        context: null
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        base_uri: 'sys:system/api-documentation',
        context: null
      })
    })

    it('should extract relations with context from entity properties', () => {
      const entity_properties = {
        relations: [
          'depends_on [[sys:system/project-setup]] (phase 1)',
          'blocked_by [[sys:system/server-configuration]] (awaiting IT approval)',
          'related_to [[sys:system/api-documentation]] (needs updated examples)'
        ]
      }

      const relations = extract_entity_relations({ entity_properties })

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        base_uri: 'sys:system/project-setup',
        context: 'phase 1'
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'sys:system/server-configuration',
        context: 'awaiting IT approval'
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        base_uri: 'sys:system/api-documentation',
        context: 'needs updated examples'
      })
    })

    it('should handle empty relations properly', () => {
      const entity_properties = {}

      const relations = extract_entity_relations({ entity_properties })

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(0)
    })

    it('should handle malformed relation strings', () => {
      const entity_properties = {
        relations: [
          'depends_on sys:system/project-setup', // Missing brackets
          'blocked_by [[sys:system/server-configuration]]', // Correctly formatted
          'related_to sys:system/api-documentation' // Missing brackets
        ]
      }

      const relations = extract_entity_relations({ entity_properties })

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(1) // Only one valid relation

      expect(relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'sys:system/server-configuration',
        context: null
      })
    })
  })

  describe('extract_entity_observations', () => {
    it('should extract basic observations from entity properties', () => {
      const entity_properties = {
        observations: [
          '[notice] User interface is confusing',
          '[improvement] Add better error messages',
          '[issue] Database connection times out'
        ]
      }

      const observations = extract_entity_observations({ entity_properties })

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(3)

      expect(observations[0]).to.deep.equal({
        category: 'notice',
        content: 'User interface is confusing',
        context: null
      })

      expect(observations[1]).to.deep.equal({
        category: 'improvement',
        content: 'Add better error messages',
        context: null
      })

      expect(observations[2]).to.deep.equal({
        category: 'issue',
        content: 'Database connection times out',
        context: null
      })
    })

    it('should extract observations with tags and context', () => {
      const entity_properties = {
        observations: [
          '[notice] User interface is confusing #ui (reported by support)',
          '[improvement] Add better error messages #ux (high priority)',
          '[issue] Database connection times out #backend (intermittent)'
        ]
      }

      const observations = extract_entity_observations({ entity_properties })

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(3)

      expect(observations[0]).to.deep.equal({
        category: 'notice',
        content: 'User interface is confusing #ui',
        context: 'reported by support'
      })

      expect(observations[1]).to.deep.equal({
        category: 'improvement',
        content: 'Add better error messages #ux',
        context: 'high priority'
      })

      expect(observations[2]).to.deep.equal({
        category: 'issue',
        content: 'Database connection times out #backend',
        context: 'intermittent'
      })
    })

    it('should handle empty observations properly', () => {
      const entity_properties = {}

      const observations = extract_entity_observations({ entity_properties })

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(0)
    })

    it('should handle malformed observation strings', () => {
      const entity_properties = {
        observations: [
          'notice: User interface is confusing', // Missing brackets
          '[improvement] Add better error messages', // Correctly formatted
          'Database connection times out' // Missing category
        ]
      }

      const observations = extract_entity_observations({ entity_properties })

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(1) // Only one valid observation

      expect(observations[0]).to.deep.equal({
        category: 'improvement',
        content: 'Add better error messages',
        context: null
      })
    })
  })
})
