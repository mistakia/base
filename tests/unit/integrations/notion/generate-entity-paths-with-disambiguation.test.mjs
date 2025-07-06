/**
 * Tests for database-aware entity path generation with conflict resolution
 */

import { expect } from 'chai'
import { describe, it, beforeEach, afterEach } from 'mocha'
import path from 'path'
import fs from 'fs/promises'

import { generate_entity_paths_with_database_disambiguation } from '#libs-server/integrations/notion/generate-entity-paths-with-disambiguation.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'

describe('Generate Entity Paths with Database Disambiguation', () => {
  let test_user_directory_info
  let test_system_directory_info

  beforeEach(async () => {
    // Clear any existing registrations
    clear_registered_directories()

    // Create temporary test directories
    test_user_directory_info = create_temp_test_directory('test-user-')
    test_system_directory_info = create_temp_test_directory('test-system-')

    // Register base directories
    register_base_directories({
      system_base_directory: test_system_directory_info.path,
      user_base_directory: test_user_directory_info.path
    })

    // Create physical-item directory and config directory
    await fs.mkdir(path.join(test_user_directory_info.path, 'physical-item'), {
      recursive: true
    })
    await fs.mkdir(path.join(test_user_directory_info.path, 'config'), {
      recursive: true
    })

    // Create test mapping configuration
    const test_mapping_config = {
      databases: {
        '7078f88d-0299-4f7a-a375-98c759d83f8e': {
          name: 'home_items',
          entity_type: 'physical_item'
        },
        '1c0576fd-7b3c-8033-80f4-d99baef71f00': {
          name: 'overlander_items',
          entity_type: 'physical_item'
        }
      }
    }

    await fs.writeFile(
      path.join(
        test_user_directory_info.path,
        'config',
        'notion-entity-mappings.json'
      ),
      JSON.stringify(test_mapping_config, null, 2)
    )
  })

  afterEach(async () => {
    // Clear registrations
    clear_registered_directories()

    // Clean up test directories
    if (test_user_directory_info) {
      test_user_directory_info.cleanup()
    }
    if (test_system_directory_info) {
      test_system_directory_info.cleanup()
    }
  })

  it('should generate base path when no conflicts exist', async () => {
    const entity_properties = {
      type: 'physical_item',
      name: 'test-item',
      title: 'test-item'
    }
    const external_id = 'notion:database:db1:page1'
    const database_id = '7078f88d-0299-4f7a-a375-98c759d83f8e'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    expect(result.base_uri).to.equal('user:physical-item/test-item.md')
    expect(result.was_disambiguated).to.be.false
    expect(result.absolute_path).to.include('physical-item/test-item.md')
  })

  it('should disambiguate when conflicting entity exists with different external_id', async () => {
    // Create existing entity file with different external_id
    const existing_file_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'shampoo.md'
    )
    const existing_content = [
      '---',
      'title: shampoo',
      'type: physical_item',
      'entity_id: existing-id',
      'external_id: notion:database:other-db:other-page',
      '---',
      '',
      'Existing shampoo entity'
    ].join('\n')

    await fs.writeFile(existing_file_path, existing_content)

    const entity_properties = {
      type: 'physical_item',
      name: 'shampoo',
      title: 'shampoo'
    }
    const external_id =
      'notion:database:7078f88d-0299-4f7a-a375-98c759d83f8e:new-page'
    const database_id = '7078f88d-0299-4f7a-a375-98c759d83f8e'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    expect(result.base_uri).to.equal('user:physical-item/shampoo-home-items.md')
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include(
      'physical-item/shampoo-home-items.md'
    )
  })

  it('should not disambiguate when existing entity has same external_id', async () => {
    const external_id =
      'notion:database:7078f88d-0299-4f7a-a375-98c759d83f8e:same-page'

    // Create existing entity file with same external_id
    const existing_file_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'shampoo.md'
    )
    const existing_content = [
      '---',
      'title: shampoo',
      'type: physical_item',
      'entity_id: existing-id',
      `external_id: ${external_id}`,
      '---',
      '',
      'Existing shampoo entity'
    ].join('\n')

    await fs.writeFile(existing_file_path, existing_content)

    const entity_properties = {
      type: 'physical_item',
      name: 'shampoo',
      title: 'shampoo'
    }
    const database_id = '7078f88d-0299-4f7a-a375-98c759d83f8e'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    expect(result.base_uri).to.equal('user:physical-item/shampoo.md')
    expect(result.was_disambiguated).to.be.false
    expect(result.absolute_path).to.include('physical-item/shampoo.md')
  })

  it('should handle standalone pages without database_id', async () => {
    // Create existing entity file with different external_id
    const existing_file_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'standalone-page.md'
    )
    const existing_content = [
      '---',
      'title: standalone-page',
      'type: physical_item',
      'entity_id: existing-id',
      'external_id: notion:page:other-page',
      '---',
      '',
      'Existing standalone page'
    ].join('\n')

    await fs.writeFile(existing_file_path, existing_content)

    const entity_properties = {
      type: 'physical_item',
      name: 'standalone-page',
      title: 'standalone-page'
    }
    const external_id = 'notion:page:new-page'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id: null
    })

    expect(result.base_uri).to.equal(
      'user:physical-item/standalone-page-notion.md'
    )
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include(
      'physical-item/standalone-page-notion.md'
    )
  })

  it('should sanitize database names for filenames', async () => {
    // Create existing entity file with different external_id
    const existing_file_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'test-item.md'
    )
    const existing_content = [
      '---',
      'title: test-item',
      'type: physical_item',
      'entity_id: existing-id',
      'external_id: notion:database:other-db:other-page',
      '---',
      '',
      'Existing test item'
    ].join('\n')

    await fs.writeFile(existing_file_path, existing_content)

    const entity_properties = {
      type: 'physical_item',
      name: 'test-item',
      title: 'test-item'
    }
    const external_id =
      'notion:database:1c0576fd-7b3c-8033-80f4-d99baef71f00:new-page'
    const database_id = '1c0576fd-7b3c-8033-80f4-d99baef71f00'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    expect(result.base_uri).to.equal(
      'user:physical-item/test-item-overlander-items.md'
    )
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include(
      'physical-item/test-item-overlander-items.md'
    )
  })

  it('should handle entities with no external_id (legacy entities)', async () => {
    // Create existing entity file with no external_id
    const existing_file_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'legacy-item.md'
    )
    const existing_content = [
      '---',
      'title: legacy-item',
      'type: physical_item',
      'entity_id: legacy-id',
      '---',
      '',
      'Legacy item without external_id'
    ].join('\n')

    await fs.writeFile(existing_file_path, existing_content)

    const entity_properties = {
      type: 'physical_item',
      name: 'legacy-item',
      title: 'legacy-item'
    }
    const external_id =
      'notion:database:7078f88d-0299-4f7a-a375-98c759d83f8e:new-page'
    const database_id = '7078f88d-0299-4f7a-a375-98c759d83f8e'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    // Should disambiguate for safety when existing entity has no external_id
    expect(result.base_uri).to.equal(
      'user:physical-item/legacy-item-home-items.md'
    )
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include(
      'physical-item/legacy-item-home-items.md'
    )
  })

  it('should handle multiple conflicts with iterative disambiguation', async () => {
    // Create first entity: test-item.md
    const file1_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'test-item.md'
    )
    await fs.writeFile(
      file1_path,
      [
        '---',
        'title: test-item',
        'type: physical_item',
        'entity_id: first-id',
        'external_id: notion:database:other-db:page1',
        '---',
        'First entity'
      ].join('\n')
    )

    // Create second entity: test-item-home-items.md
    const file2_path = path.join(
      test_user_directory_info.path,
      'physical-item',
      'test-item-home-items.md'
    )
    await fs.writeFile(
      file2_path,
      [
        '---',
        'title: test-item',
        'type: physical_item',
        'entity_id: second-id',
        'external_id: notion:database:7078f88d-0299-4f7a-a375-98c759d83f8e:page2',
        '---',
        'Second entity'
      ].join('\n')
    )

    // Test third entity - should get test-item-home-items-2.md
    const entity_properties = {
      type: 'physical_item',
      name: 'test-item',
      title: 'test-item'
    }
    const external_id =
      'notion:database:7078f88d-0299-4f7a-a375-98c759d83f8e:page3'
    const database_id = '7078f88d-0299-4f7a-a375-98c759d83f8e'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id
    })

    expect(result.base_uri).to.equal(
      'user:physical-item/test-item-home-items-2.md'
    )
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include(
      'physical-item/test-item-home-items-2.md'
    )
  })

  it('should handle multiple standalone page conflicts', async () => {
    // Create text directory
    await fs.mkdir(path.join(test_user_directory_info.path, 'text'), {
      recursive: true
    })

    // Create test-page.md
    const file1_path = path.join(
      test_user_directory_info.path,
      'text',
      'test-page.md'
    )
    await fs.writeFile(
      file1_path,
      [
        '---',
        'title: test-page',
        'type: text',
        'entity_id: first-id',
        'external_id: notion:page:page1',
        '---',
        'First page'
      ].join('\n')
    )

    // Create test-page-notion.md
    const file2_path = path.join(
      test_user_directory_info.path,
      'text',
      'test-page-notion.md'
    )
    await fs.writeFile(
      file2_path,
      [
        '---',
        'title: test-page',
        'type: text',
        'entity_id: second-id',
        'external_id: notion:page:page2',
        '---',
        'Second page'
      ].join('\n')
    )

    // Test third standalone page - should get test-page-notion-2.md
    const entity_properties = {
      type: 'text',
      name: 'test-page',
      title: 'test-page'
    }
    const external_id = 'notion:page:page3'

    const result = await generate_entity_paths_with_database_disambiguation({
      entity_properties,
      external_id,
      database_id: null
    })

    expect(result.base_uri).to.equal('user:text/test-page-notion-2.md')
    expect(result.was_disambiguated).to.be.true
    expect(result.absolute_path).to.include('text/test-page-notion-2.md')
  })
})
