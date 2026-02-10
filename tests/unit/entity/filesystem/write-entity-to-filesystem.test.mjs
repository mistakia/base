import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_entity_to_filesystem', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-entity-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should write entity to filesystem successfully', async () => {
    const absolute_path = path.join(temp_dir, 'test-entity.md')
    const entity_properties = {
      title: 'Test Entity',
      description: 'Test description',
      user_public_key: 'abc123',
      tags: ['tag1', 'tag2']
    }
    const entity_type = 'test'
    const entity_content = '# Test Entity\n\nContent body'

    const result = await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content
    })

    expect(result).to.be.an('object')
    expect(result.success).to.be.true
    expect(result.entity_id).to.be.a('string')

    // Check that file exists
    const file_exists = await fs
      .access(absolute_path)
      .then(() => true)
      .catch(() => false)
    expect(file_exists).to.be.true

    // Check file content
    const file_content = await fs.readFile(absolute_path, 'utf8')
    expect(file_content).to.include('title: Test Entity')
    expect(file_content).to.include('type: test')
    expect(file_content).to.include('description:')
    expect(file_content).to.include('Test description')
    expect(file_content).to.include('user_public_key: abc123')
    expect(file_content).to.include('tags:')
    expect(file_content).to.include('# Test Entity')
    expect(file_content).to.include('Content body')
  })

  it('should write a minimal entity with defaults', async () => {
    const absolute_path = path.join(temp_dir, 'minimal-entity.md')
    const entity_properties = {
      title: 'Minimal Entity',
      description: 'Minimal description',
      user_public_key: 'abc123'
    }
    const entity_type = 'minimal'

    // Call without entity_content parameter to use default
    const result = await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type
    })

    expect(result).to.be.an('object')
    expect(result.success).to.be.true
    expect(result.entity_id).to.be.a('string')

    const file_content = await fs.readFile(absolute_path, 'utf8')
    expect(file_content).to.include('title: Minimal Entity')
    expect(file_content).to.include('type: minimal')
    expect(file_content).to.include('created_at:')
    expect(file_content).to.include('updated_at:')
  })

  it('should throw error if absolute_path is missing', async () => {
    try {
      await write_entity_to_filesystem({
        entity_properties: {
          title: 'Test',
          description: 'Test',
          user_public_key: 'abc123'
        },
        entity_type: 'test'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Absolute path is required')
    }
  })

  it('should throw error if entity_properties is missing', async () => {
    try {
      await write_entity_to_filesystem({
        absolute_path: path.join(temp_dir, 'test.md'),
        entity_type: 'test'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Entity properties must be a valid object')
    }
  })

  it('should throw error if entity_type is missing', async () => {
    try {
      await write_entity_to_filesystem({
        absolute_path: path.join(temp_dir, 'test.md'),
        entity_properties: {
          title: 'Test',
          description: 'Test',
          user_public_key: '123'
        }
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Entity type is required')
    }
  })

  it('should handle extended entity types', async () => {
    const absolute_path = path.join(temp_dir, 'test-task.md')
    const entity_properties = {
      title: 'Test Task',
      description: 'Test task description',
      user_public_key: 'abc123',
      status: 'In Progress',
      priority: 'High',
      start_by: '2023-03-01T00:00:00.000Z',
      finish_by: '2023-03-15T00:00:00.000Z'
    }
    const entity_type = 'task'

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type
    })

    const file_content = await fs.readFile(absolute_path, 'utf8')
    expect(file_content).to.include('title: Test Task')
    expect(file_content).to.include('type: task')
    expect(file_content).to.include('status: In Progress')
    expect(file_content).to.include('priority: High')
    // Check for date values - quote style may vary based on formatting
    expect(file_content).to.match(/start_by: ['"]?2023-03-01T00:00:00\.000Z['"]?/)
    expect(file_content).to.match(/finish_by: ['"]?2023-03-15T00:00:00\.000Z['"]?/)
  })

  it('should create a file with properly formatted frontmatter and content', async () => {
    const absolute_path = path.join(temp_dir, 'full-entity.md')
    const entity_properties = {
      title: 'Full Entity',
      description: 'Complete entity with all base fields',
      user_public_key: 'abc123',
      permalink: '/custom-path',
      tags: ['test', 'entity', 'complete'],
      relations: [
        'relates_to [[entity/other-entity]]',
        'depends_on [[entity/dependency]]'
      ],
      observations: [
        '[note] This is a test observation',
        '[tech] Uses markdown #format'
      ],
      archived_at: '2023-05-01T12:00:00.000Z'
    }
    const entity_type = 'complete'
    const entity_content =
      '# Full Entity\n\nThis is a complete entity with all base fields.\n\n## Section\n\nContent with multiple paragraphs and sections.'

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content
    })

    const file_content = await fs.readFile(absolute_path, 'utf8')

    // Check that frontmatter is properly formatted
    expect(file_content).to.include('---')
    expect(file_content).to.include('title: Full Entity')
    expect(file_content).to.include('type: complete')
    expect(file_content).to.include('permalink: /custom-path')

    // Check array formatting
    expect(file_content).to.include('tags:')
    expect(file_content).to.include('test')
    expect(file_content).to.include('entity')
    expect(file_content).to.include('complete')

    expect(file_content).to.include('relations:')
    expect(file_content).to.include('relates_to [[entity/other-entity]]')
    expect(file_content).to.include('depends_on [[entity/dependency]]')

    expect(file_content).to.include('observations:')
    expect(file_content).to.include('[note] This is a test observation')
    expect(file_content).to.include('[tech] Uses markdown #format')

    // Check content formatting
    expect(file_content).to.include('# Full Entity')
    expect(file_content).to.include(
      'This is a complete entity with all base fields.'
    )
    expect(file_content).to.include('## Section')
    expect(file_content).to.include(
      'Content with multiple paragraphs and sections.'
    )
  })
})
