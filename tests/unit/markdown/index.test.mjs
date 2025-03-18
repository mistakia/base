import { expect } from 'chai'
import {
  process_markdown_entity,
  extract_tags,
  extract_relations,
  extract_observations,
  extract_frontmatter_relations
} from '#libs-server/markdown/index.mjs'

describe('Markdown Index Module', () => {
  describe('extract_tags', () => {
    it('should extract tags from frontmatter', () => {
      const parsed = {
        frontmatter: {
          tags: ['development', 'javascript', 'testing']
        }
      }

      const tags = extract_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(3)
      expect(tags[0]).to.deep.include({ name: 'development' })
      expect(tags[1]).to.deep.include({ name: 'javascript' })
      expect(tags[2]).to.deep.include({ name: 'testing' })
    })

    it('should extract hashtags from markdown content', () => {
      const parsed = {
        markdown: `
          # Test Document

          This is a test #javascript document for #testing purposes.

          Multiple hashtags #one #two #three should all be detected.
        `,
        frontmatter: {}
      }

      const tags = extract_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(5)
      expect(tags).to.deep.include({ name: 'javascript' })
      expect(tags).to.deep.include({ name: 'testing' })
      expect(tags).to.deep.include({ name: 'one' })
      expect(tags).to.deep.include({ name: 'two' })
      expect(tags).to.deep.include({ name: 'three' })
    })

    it('should combine tags from frontmatter and markdown content', () => {
      const parsed = {
        frontmatter: {
          tags: ['frontend', 'development']
        },
        markdown: `
          # Frontend Development

          Working on #javascript and #react components.
        `
      }

      const tags = extract_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(4)
      expect(tags).to.deep.include({ name: 'frontend' })
      expect(tags).to.deep.include({ name: 'development' })
      expect(tags).to.deep.include({ name: 'javascript' })
      expect(tags).to.deep.include({ name: 'react' })
    })

    it('should handle empty tags properly', () => {
      const parsed = {
        frontmatter: {},
        markdown: 'Just some plain text without hashtags.'
      }

      const tags = extract_tags(parsed)

      expect(tags).to.be.an('array')
      expect(tags).to.have.lengthOf(0)
    })
  })

  describe('extract_relations', () => {
    it('should extract basic relations from frontmatter', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on [[Project Setup]]',
            'blocked_by [[Server Configuration]]',
            'related_to [[API Documentation]]'
          ]
        }
      }

      const relations = extract_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        target_title: 'Project Setup',
        context: null
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        target_title: 'Server Configuration',
        context: null
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        target_title: 'API Documentation',
        context: null
      })
    })

    it('should extract relations with context from frontmatter', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on [[Project Setup]] (phase 1)',
            'blocked_by [[Server Configuration]] (awaiting IT approval)',
            'related_to [[API Documentation]] (needs updated examples)'
          ]
        }
      }

      const relations = extract_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(3)

      expect(relations[0]).to.deep.equal({
        relation_type: 'depends_on',
        target_title: 'Project Setup',
        context: 'phase 1'
      })

      expect(relations[1]).to.deep.equal({
        relation_type: 'blocked_by',
        target_title: 'Server Configuration',
        context: 'awaiting IT approval'
      })

      expect(relations[2]).to.deep.equal({
        relation_type: 'related_to',
        target_title: 'API Documentation',
        context: 'needs updated examples'
      })
    })

    it('should handle empty relations properly', () => {
      const parsed = {
        frontmatter: {}
      }

      const relations = extract_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(0)
    })

    it('should handle malformed relation strings', () => {
      const parsed = {
        frontmatter: {
          relations: [
            'depends_on Project Setup', // Missing brackets
            'blocked_by [[Server Configuration]]', // Correctly formatted
            'related_to API Documentation' // Missing brackets
          ]
        }
      }

      const relations = extract_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(1) // Only one valid relation

      expect(relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        target_title: 'Server Configuration',
        context: null
      })
    })
  })

  describe('extract_observations', () => {
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

      const observations = extract_observations(parsed)

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

      const observations = extract_observations(parsed)

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

      const observations = extract_observations(parsed)

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

      const observations = extract_observations(parsed)

      expect(observations).to.be.an('array')
      expect(observations).to.have.lengthOf(1) // Only one valid observation

      expect(observations[0]).to.deep.equal({
        category: 'improvement',
        content: 'Add better error messages',
        context: null
      })
    })
  })

  describe('extract_frontmatter_relations', () => {
    it('should extract task relations from frontmatter', () => {
      const parsed = {
        frontmatter: {
          type: 'task',
          persons: ['John Doe', 'Jane Smith'],
          physical_items: ['Server Hardware', 'Network Equipment'],
          digital_items: ['Configuration File', 'Database Backup'],
          parent_tasks: ['Project Setup'],
          dependent_tasks: ['Deploy Application'],
          activities: ['Server Maintenance'],
          organizations: ['IT Department']
        }
      }

      const relations = extract_frontmatter_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(10)

      expect(relations).to.deep.include({
        relation_type: 'assigned_to',
        target_title: 'John Doe'
      })

      expect(relations).to.deep.include({
        relation_type: 'assigned_to',
        target_title: 'Jane Smith'
      })

      expect(relations).to.deep.include({
        relation_type: 'requires',
        target_title: 'Server Hardware'
      })

      expect(relations).to.deep.include({
        relation_type: 'requires',
        target_title: 'Network Equipment'
      })

      expect(relations).to.deep.include({
        relation_type: 'requires',
        target_title: 'Configuration File'
      })

      expect(relations).to.deep.include({
        relation_type: 'requires',
        target_title: 'Database Backup'
      })

      expect(relations).to.deep.include({
        relation_type: 'child_of',
        target_title: 'Project Setup'
      })

      expect(relations).to.deep.include({
        relation_type: 'depends_on',
        target_title: 'Deploy Application'
      })
    })

    it('should extract physical_item relations from frontmatter', () => {
      const parsed = {
        frontmatter: {
          type: 'physical_item',
          parent_items: ['Server Rack'],
          child_items: ['CPU', 'RAM', 'Hard Drive']
        }
      }

      const relations = extract_frontmatter_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(4)

      expect(relations).to.deep.include({
        relation_type: 'part_of',
        target_title: 'Server Rack'
      })

      expect(relations).to.deep.include({
        relation_type: 'contains',
        target_title: 'CPU'
      })

      expect(relations).to.deep.include({
        relation_type: 'contains',
        target_title: 'RAM'
      })

      expect(relations).to.deep.include({
        relation_type: 'contains',
        target_title: 'Hard Drive'
      })
    })

    it('should extract person and organization relations from frontmatter', () => {
      const parsed_person = {
        frontmatter: {
          type: 'person',
          organizations: ['Engineering', 'Product Team']
        }
      }

      const parsed_org = {
        frontmatter: {
          type: 'organization',
          members: ['John Doe', 'Jane Smith']
        }
      }

      const person_relations = extract_frontmatter_relations(parsed_person)
      const org_relations = extract_frontmatter_relations(parsed_org)

      expect(person_relations).to.be.an('array')
      expect(person_relations).to.have.lengthOf(2)
      expect(person_relations).to.deep.include({
        relation_type: 'member_of',
        target_title: 'Engineering'
      })
      expect(person_relations).to.deep.include({
        relation_type: 'member_of',
        target_title: 'Product Team'
      })

      expect(org_relations).to.be.an('array')
      expect(org_relations).to.have.lengthOf(2)
      expect(org_relations).to.deep.include({
        relation_type: 'has_member',
        target_title: 'John Doe'
      })
      expect(org_relations).to.deep.include({
        relation_type: 'has_member',
        target_title: 'Jane Smith'
      })
    })

    it('should handle unknown entity types properly', () => {
      const parsed = {
        frontmatter: {
          type: 'unknown_type',
          persons: ['John Doe'],
          organizations: ['IT Department']
        }
      }

      const relations = extract_frontmatter_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(0) // No relations for unknown type
    })

    it('should handle missing properties properly', () => {
      const parsed = {
        frontmatter: {
          type: 'task'
          // No relation properties
        }
      }

      const relations = extract_frontmatter_relations(parsed)

      expect(relations).to.be.an('array')
      expect(relations).to.have.lengthOf(0)
    })
  })

  describe('process_markdown_entity', () => {
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
  - important
  - development
relations:
  - blocked_by [[Server Configuration]] (awaiting approval)
---

# Test Task

This is a #test task for #development purposes.
`

      const file_info = {
        file_path: 'tasks/test-task.md',
        git_sha: 'abc123',
        absolute_path: '/path/to/tasks/test-task.md'
      }

      const result = await process_markdown_entity(content, file_info)

      // Check basic parsing
      expect(result.frontmatter.title).to.equal('Test Task')
      expect(result.frontmatter.type).to.equal('task')
      expect(result.frontmatter.status).to.equal('In Progress')

      // Check extracted metadata
      expect(result.extracted).to.be.an('object')

      // Check tags (from both frontmatter and content)
      expect(result.extracted.tags).to.be.an('array')
      expect(result.extracted.tags).to.have.lengthOf(4)
      expect(result.extracted.tags).to.deep.include({ name: 'important' })
      expect(result.extracted.tags).to.deep.include({ name: 'development' })
      expect(result.extracted.tags).to.deep.include({ name: 'test' })

      // Check explicit relations
      expect(result.extracted.relations).to.be.an('array')
      expect(result.extracted.relations).to.have.lengthOf(1)
      expect(result.extracted.relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        target_title: 'Server Configuration',
        context: 'awaiting approval'
      })

      // Check frontmatter relations
      expect(result.extracted.frontmatter_relations).to.be.an('array')
      expect(result.extracted.frontmatter_relations.length).to.be.at.least(3)
      expect(result.extracted.frontmatter_relations).to.deep.include({
        relation_type: 'assigned_to',
        target_title: 'John Doe'
      })
      expect(result.extracted.frontmatter_relations).to.deep.include({
        relation_type: 'assigned_to',
        target_title: 'Jane Smith'
      })
      expect(result.extracted.frontmatter_relations).to.deep.include({
        relation_type: 'child_of',
        target_title: 'Project Setup'
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

      const file_info = {
        file_path: 'tasks/test-task.md',
        git_sha: 'abc123',
        absolute_path: '/path/to/tasks/test-task.md'
      }

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      const result = await process_markdown_entity(content, file_info, schemas)

      // Check validation results
      expect(result.validation).to.be.an('object')
      expect(result.validation.valid).to.be.false
      expect(result.validation.errors).to.be.an('array')

      // Still extracts metadata even if validation fails
      expect(result.extracted).to.be.an('object')
      expect(result.extracted.tags).to.be.an('array')
      expect(result.extracted.relations).to.be.an('array')
      expect(result.extracted.frontmatter_relations).to.be.an('array')
    })
  })
})
