import { expect } from 'chai'
import {
  process_markdown_content,
  extract_entity_tags,
  extract_entity_relations,
  extract_entity_observations
} from '#libs-server/markdown/processor/index.mjs'

describe('Markdown Index Module', () => {
  describe('extract_entity_tags', () => {
    it('should extract tags from frontmatter', () => {
      const parsed = {
        frontmatter: {
          tags: ['system/development', 'system/javascript', 'system/testing']
        }
      }

      const tags = extract_entity_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(3)
      expect(tags[0]).to.deep.include({ tag_id: 'system/development' })
      expect(tags[1]).to.deep.include({ tag_id: 'system/javascript' })
      expect(tags[2]).to.deep.include({ tag_id: 'system/testing' })
    })

    it('should extract hashtags from markdown content', () => {
      const parsed = {
        markdown: `
          # Test Document

          This is a test #system/javascript document for #system/testing purposes.

          Multiple hashtags #system/one #system/two #system/three should all be detected.
        `,
        frontmatter: {}
      }

      const tags = extract_entity_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(5)
      expect(tags).to.deep.include({ tag_id: 'system/javascript' })
      expect(tags).to.deep.include({ tag_id: 'system/testing' })
      expect(tags).to.deep.include({ tag_id: 'system/one' })
      expect(tags).to.deep.include({ tag_id: 'system/two' })
      expect(tags).to.deep.include({ tag_id: 'system/three' })
    })

    it('should combine tags from frontmatter and markdown content', () => {
      const parsed = {
        frontmatter: {
          tags: ['system/frontend', 'system/development']
        },
        markdown: `
          # Frontend Development

          Working on #system/javascript and #system/react components.
        `
      }

      const tags = extract_entity_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(4)
      expect(tags).to.deep.include({ tag_id: 'system/frontend' })
      expect(tags).to.deep.include({ tag_id: 'system/development' })
      expect(tags).to.deep.include({ tag_id: 'system/javascript' })
      expect(tags).to.deep.include({ tag_id: 'system/react' })
    })

    it('should handle empty tags properly', () => {
      const parsed = {
        frontmatter: {},
        markdown: 'Just some plain text without hashtags.'
      }

      const tags = extract_entity_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(0)
    })
  })

  describe('extract_entity_relations', () => {
    it('should extract basic relations from frontmatter', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on [[system/project-setup]]',
            'blocked_by [[system/server-configuration]]',
            'related_to [[system/api-documentation]]'
          ]
        }
      }

      const relations = extract_entity_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        entity_path: 'system/project-setup',
        context: null
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        entity_path: 'system/server-configuration',
        context: null
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        entity_path: 'system/api-documentation',
        context: null
      })
    })

    it('should extract relations with context from frontmatter', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on [[system/project-setup]] (phase 1)',
            'blocked_by [[system/server-configuration]] (awaiting IT approval)',
            'related_to [[system/api-documentation]] (needs updated examples)'
          ]
        }
      }

      const relations = extract_entity_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        entity_path: 'system/project-setup',
        context: 'phase 1'
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        entity_path: 'system/server-configuration',
        context: 'awaiting IT approval'
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        entity_path: 'system/api-documentation',
        context: 'needs updated examples'
      })
    })

    it('should handle empty relations properly', () => {
      const parsed = {
        frontmatter: {}
      }

      const relations = extract_entity_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(0)
    })

    it('should handle malformed relation strings', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on system/project-setup', // Missing brackets
            'blocked_by [[system/server-configuration]]', // Correctly formatted
            'related_to system/api-documentation' // Missing brackets
          ]
        }
      }

      const relations = extract_entity_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(1) // Only one valid relation

      expect(relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        entity_path: 'system/server-configuration',
        context: null
      })
    })
  })

  describe('extract_entity_observations', () => {
    it('should extract basic observations from frontmatter', () => {
      const parsed = {
        frontmatter: {
          observations: [
            '[notice] User interface is confusing',
            '[improvement] Add better error messages',
            '[issue] Database connection times out'
          ]
        }
      }

      const observations = extract_entity_observations(parsed)

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
      const parsed = {
        frontmatter: {
          observations: [
            '[notice] User interface is confusing #ui (reported by support)',
            '[improvement] Add better error messages #ux (high priority)',
            '[issue] Database connection times out #backend (intermittent)'
          ]
        }
      }

      const observations = extract_entity_observations(parsed)

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
      const parsed = {
        frontmatter: {}
      }

      const observations = extract_entity_observations(parsed)

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(0)
    })

    it('should handle malformed observation strings', () => {
      const parsed = {
        frontmatter: {
          observations: [
            'notice: User interface is confusing', // Missing brackets
            '[improvement] Add better error messages', // Correctly formatted
            'Database connection times out' // Missing category
          ]
        }
      }

      const observations = extract_entity_observations(parsed)

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(1) // Only one valid observation

      expect(observations[0]).to.deep.equal({
        category: 'improvement',
        content: 'Add better error messages',
        context: null
      })
    })
  })

  describe('process_markdown_content', () => {
    it('should process a markdown entity and extract all metadata', async () => {
      const content = `---
title: Test Task
type: task
status: In Progress
priority: High
persons:
  - John Doe
  - Jane Smith
parent_tasks:
  - Project Setup
tags:
  - system/important
  - system/development
relations:
  - blocked_by [[system/server-configuration]] (awaiting approval)
---

# Test Task

This is a #system/test task for #system/development purposes.
`

      const result = await process_markdown_content({
        content,
        file_path: 'tasks/test-task.md'
      })

      // Check basic parsing
      expect(result.frontmatter.title).to.equal('Test Task')
      expect(result.frontmatter.type).to.equal('task')
      expect(result.frontmatter.status).to.equal('In Progress')

      // Check extracted entity metadata
      expect(result.entity_metadata).to.be.an('object')

      // Check tags (from both frontmatter and content)
      expect(result.entity_metadata.tags).to.be.an('array')
      expect(result.entity_metadata.tags).to.have.lengthOf(4)
      expect(result.entity_metadata.tags).to.deep.include({
        tag_id: 'system/important'
      })
      expect(result.entity_metadata.tags).to.deep.include({
        tag_id: 'system/development'
      })
      expect(result.entity_metadata.tags).to.deep.include({
        tag_id: 'system/test'
      })

      // Check explicit relations
      expect(result.entity_metadata.relations).to.be.an('array')
      expect(result.entity_metadata.relations).to.have.lengthOf(1)
      expect(result.entity_metadata.relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        entity_path: 'system/server-configuration',
        context: 'awaiting approval'
      })
    })

    it('should handle validation against schema', async () => {
      const content = `---
title: Test Task
type: task
status: Invalid Status
priority: High
---

# Test Task

This is a test task.
`

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      const result = await process_markdown_content({
        content,
        file_path: 'tasks/test-task.md',
        schemas
      })

      // Check validation results
      expect(result).to.be.an('object')
      expect(result.valid).to.be.false
      expect(result.errors).to.be.an('array')

      // Still extracts metadata even if validation fails
      expect(result.entity_metadata).to.be.an('object')
      expect(result.entity_metadata.tags).to.be.an('array')
      expect(result.entity_metadata.relations).to.be.an('array')
    })
  })
})
