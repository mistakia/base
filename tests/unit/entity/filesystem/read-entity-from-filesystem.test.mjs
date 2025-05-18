import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('read_entity_from_filesystem', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-entity-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should read an entity from the filesystem successfully', async () => {
    // First write an entity to read
    const absolute_path = path.join(temp_dir, 'test-entity.md')
    const entity_properties = {
      title: 'Test Entity',
      description: 'Test description',
      user_id: '123456',
      tags: ['tag1', 'tag2']
    }
    const entity_type = 'test'
    const entity_content = '# Test Entity\n\nContent body'

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content
    })

    // Now read the entity
    const result = await read_entity_from_filesystem({
      absolute_path
    })

    // Verify result
    expect(result.success).to.be.true
    expect(result.absolute_path).to.equal(absolute_path)
    expect(result.entity_properties).to.include({
      title: 'Test Entity',
      type: 'test',
      description: 'Test description',
      user_id: '123456'
    })

    // Check that tags are present
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('tag1')
    expect(result.entity_properties.tags).to.include('tag2')

    // Check content and raw_content
    expect(result.entity_content).to.equal('# Test Entity\n\nContent body')
    expect(result.raw_content).to.be.a('string')
    expect(result.raw_content).to.include('title: "Test Entity"')
    expect(result.raw_content).to.include('type: "test"')
    expect(result.raw_content).to.include('# Test Entity')
  })

  it('should handle an entity with complex frontmatter', async () => {
    const absolute_path = path.join(temp_dir, 'complex-entity.md')
    const entity_properties = {
      title: 'Complex Entity',
      description: 'Entity with complex frontmatter',
      user_id: 'user-123',
      status: 'In Progress',
      priority: 'High',
      relations: [
        'relates_to [[entity/other-entity]]',
        'depends_on [[entity/dependency]]'
      ],
      observations: [
        '[note] This is a test observation',
        '[tech] Uses markdown #format'
      ],
      custom_object: {
        key1: 'value1',
        key2: 'value2'
      }
    }
    const entity_type = 'complex'

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type
    })

    const result = await read_entity_from_filesystem({
      absolute_path
    })

    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Complex Entity')
    expect(result.entity_properties.type).to.equal('complex')
    expect(result.entity_properties.status).to.equal('In Progress')
    expect(result.entity_properties.priority).to.equal('High')

    // Check arrays
    expect(result.entity_properties.relations)
      .to.be.an('array')
      .with.lengthOf(2)
    expect(result.entity_properties.observations)
      .to.be.an('array')
      .with.lengthOf(2)

    // Check created_at and updated_at timestamps were added
    expect(result.entity_properties.created_at).to.be.a('string')
    expect(result.entity_properties.updated_at).to.be.a('string')
  })

  it('should return error when file does not exist', async () => {
    const non_existent_path = path.join(temp_dir, 'non-existent-entity.md')

    const result = await read_entity_from_filesystem({
      absolute_path: non_existent_path
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('File not found')
    expect(result.absolute_path).to.equal(non_existent_path)
  })

  it('should return error if entity type is missing in frontmatter', async () => {
    // Create a file without a type property
    const absolute_path = path.join(temp_dir, 'no-type-entity.md')
    const content = `---
title: "No Type Entity"
description: "Entity without type"
user_id: "123456"
---

# No Type Entity

This entity has no type.
`
    await fs.writeFile(absolute_path, content, 'utf8')

    const result = await read_entity_from_filesystem({
      absolute_path
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('No entity type found')
  })

  it('should return error if absolute_path is missing', async () => {
    const result = await read_entity_from_filesystem({})

    expect(result.success).to.be.false
    expect(result.error).to.equal('Absolute path is required')
  })

  it('should handle malformed frontmatter gracefully', async () => {
    const absolute_path = path.join(temp_dir, 'malformed-frontmatter.md')
    const malformed_content = `---
title: "Malformed Frontmatter
description: Missing closing quote
---

# Malformed content
`
    await fs.writeFile(absolute_path, malformed_content, 'utf8')

    const result = await read_entity_from_filesystem({
      absolute_path
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })
})
