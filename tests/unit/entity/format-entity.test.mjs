import { expect } from 'chai'
import { format_entity_from_file_content } from '#libs-server/entity/format/index.mjs'

describe('Entity Format Module', () => {
  describe('format_entity_from_file_content', () => {
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
  - sys:system/important
  - sys:system/development
relations:
  - blocked_by [[sys:system/server-configuration]] (awaiting approval)
---

# Test Task

This is a #system/test task for #system/development purposes.
`

      const result = await format_entity_from_file_content({
        file_content: content,
        file_path: 'tasks/test-task.md'
      })

      // Check basic parsing
      expect(result.entity_properties.title).to.equal('Test Task')
      expect(result.entity_properties.type).to.equal('task')
      expect(result.entity_properties.status).to.equal('In Progress')

      // Check extracted entity metadata
      expect(result.formatted_entity_metadata).to.be.an('object')

      // Check tags (from both entity_properties and content)
      expect(result.formatted_entity_metadata.property_tags).to.be.an('array')
      expect(
        result.formatted_entity_metadata.property_tags.length
      ).to.be.at.least(2)
      expect(result.formatted_entity_metadata.property_tags).to.deep.include({
        base_uri: 'sys:system/important'
      })
      expect(result.formatted_entity_metadata.property_tags).to.deep.include({
        base_uri: 'sys:system/development'
      })

      // Check explicit relations
      expect(result.formatted_entity_metadata.relations).to.be.an('array')
      expect(result.formatted_entity_metadata.relations).to.have.lengthOf(1)
      expect(result.formatted_entity_metadata.relations[0]).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'sys:system/server-configuration',
        context: 'awaiting approval'
      })
    })
  })
})
