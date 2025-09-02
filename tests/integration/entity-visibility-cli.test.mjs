/* global describe it beforeEach before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('Entity Visibility CLI Tool', function () {
  let test_dir
  let cli_path
  let test_entity_path
  let test_thread_dir

  before(async function () {
    this.timeout(15000)

    // Create temporary test directory
    test_dir = await create_temp_test_directory()

    // Path to CLI tool
    cli_path = path.resolve('./cli/entity-visibility.mjs')

    // Test files
    test_entity_path = path.join(test_dir, 'test-entity.md')
    test_thread_dir = path.join(test_dir, 'thread-test')

    // Create test thread directory
    await fs.mkdir(test_thread_dir, { recursive: true })
  })

  after(async function () {
    // Cleanup test directory
    if (test_dir) {
      try {
        await fs.rm(test_dir, { recursive: true, force: true })
      } catch (error) {
        console.warn(`Failed to clean up test directory: ${error.message}`)
      }
    }
  })

  beforeEach(async function () {
    // Create a test entity file
    const entity_content = `---
title: Test Entity
type: test
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
user_public_key: test-key
---

This is a test entity for CLI testing.`

    await fs.writeFile(test_entity_path, entity_content)

    // Create a test thread metadata file
    const thread_metadata = {
      thread_id: 'test-thread',
      user_public_key: 'test-key',
      session_provider: 'base',
      thread_state: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const metadata_path = path.join(test_thread_dir, 'metadata.json')
    await fs.writeFile(metadata_path, JSON.stringify(thread_metadata, null, 2))
  })

  describe('CLI help and usage', function () {
    it('should display help when --help is used', async function () {
      try {
        const { stdout } = await execute(
          `NODE_ENV=test node ${cli_path} --help`
        )
        expect(stdout).to.include('Manage public_read settings')
        expect(stdout).to.include('set <pattern> <value>')
      } catch (error) {
        // Help command may exit with code 0 or 1 depending on yargs version
        if (error.stdout) {
          expect(error.stdout).to.include('Manage public_read settings')
        } else {
          throw error
        }
      }
    })

    it('should show error for missing command', async function () {
      try {
        await execute(`NODE_ENV=test node ${cli_path}`)
        throw new Error('Should have failed')
      } catch (error) {
        expect(error.stderr || error.stdout).to.include(
          'You must provide a command'
        )
      }
    })
  })

  describe('Setting public_read on entity files', function () {
    it('should set public_read to true on markdown entity', async function () {
      this.timeout(10000)

      // Set public_read to true
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" true`
      )

      expect(stdout).to.include('✅')
      expect(stdout).to.include('undefined → true')

      // Verify the file was updated
      const result = await read_entity_from_filesystem({
        absolute_path: test_entity_path
      })
      expect(result.success).to.be.true
      expect(result.entity_properties.public_read).to.be.true
    })

    it('should set public_read to false on markdown entity', async function () {
      this.timeout(10000)

      // First set to true
      await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" true`
      )

      // Then set to false
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" false`
      )

      expect(stdout).to.include('✅')
      expect(stdout).to.include('true → false')

      // Verify the file was updated
      const result = await read_entity_from_filesystem({
        absolute_path: test_entity_path
      })
      expect(result.success).to.be.true
      expect(result.entity_properties.public_read).to.be.false
    })

    it('should handle no change gracefully', async function () {
      this.timeout(10000)

      // Set to true twice
      await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" true`
      )
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" true`
      )

      expect(stdout).to.include('✅')
      expect(stdout).to.include('true (no change)')
    })
  })

  describe('Setting public_read on thread metadata', function () {
    it('should set public_read to true on thread metadata.json', async function () {
      this.timeout(10000)

      const metadata_path = path.join(test_thread_dir, 'metadata.json')

      // Set public_read to true
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${metadata_path}" true`
      )

      expect(stdout).to.include('✅')
      expect(stdout).to.include('undefined → true')

      // Verify the file was updated
      const content = await fs.readFile(metadata_path, 'utf8')
      const metadata = JSON.parse(content)
      expect(metadata.public_read).to.be.true
    })

    it('should set public_read to false on thread metadata.json', async function () {
      this.timeout(10000)

      const metadata_path = path.join(test_thread_dir, 'metadata.json')

      // First set to true
      await execute(
        `NODE_ENV=test node ${cli_path} set "${metadata_path}" true`
      )

      // Then set to false
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${metadata_path}" false`
      )

      expect(stdout).to.include('✅')
      expect(stdout).to.include('true → false')

      // Verify the file was updated
      const content = await fs.readFile(metadata_path, 'utf8')
      const metadata = JSON.parse(content)
      expect(metadata.public_read).to.be.false
    })
  })

  describe('Pattern matching for bulk operations', function () {
    beforeEach(async function () {
      // Create additional test files
      const entity_paths = [
        path.join(test_dir, 'entity1.md'),
        path.join(test_dir, 'entity2.md'),
        path.join(test_dir, 'task1.md')
      ]

      for (const entity_path of entity_paths) {
        const content = `---
title: ${path.basename(entity_path, '.md')}
type: test
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
user_public_key: test-key
---

Test content for ${path.basename(entity_path)}.`

        await fs.writeFile(entity_path, content)
      }
    })

    it('should handle glob patterns for multiple files', async function () {
      this.timeout(15000)

      const pattern = path.join(test_dir, '*.md')

      // Set all .md files to public
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${pattern}" true`
      )

      expect(stdout).to.include('Found')
      expect(stdout).to.include('file(s) to process')
      expect(stdout).to.include('✅')

      // Verify files were updated
      const files = await fs.readdir(test_dir)
      const md_files = files.filter((f) => f.endsWith('.md'))

      for (const file of md_files) {
        const file_path = path.join(test_dir, file)
        const result = await read_entity_from_filesystem({
          absolute_path: file_path
        })
        expect(result.success).to.be.true
        expect(result.entity_properties.public_read).to.be.true
      }
    })

    it('should report when no files match pattern', async function () {
      this.timeout(10000)

      const pattern = path.join(test_dir, '*.nonexistent')

      // Try to set files that don't exist
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${pattern}" true`
      )

      expect(stdout).to.include('No supported files found matching pattern')
    })
  })

  describe('Dry-run functionality', function () {
    it('should preview changes without applying them in dry-run mode', async function () {
      this.timeout(10000)

      // Run in dry-run mode
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${test_entity_path}" true --dry-run`
      )

      expect(stdout).to.include('🏃 Running in dry-run mode')
      expect(stdout).to.include('🔍 [DRY RUN]')
      expect(stdout).to.include('undefined → true')
      expect(stdout).to.include('Run without --dry-run to apply these changes')

      // Verify the file was NOT updated
      const result = await read_entity_from_filesystem({
        absolute_path: test_entity_path
      })
      expect(result.success).to.be.true
      expect(result.entity_properties.public_read).to.be.undefined
    })
  })

  describe('Validation and error handling', function () {
    it('should reject invalid boolean values', async function () {
      this.timeout(10000)

      try {
        await execute(
          `NODE_ENV=test node ${cli_path} set "${test_entity_path}" invalid`
        )
        throw new Error('Should have failed')
      } catch (error) {
        expect(error.stderr || error.stdout).to.include('Invalid boolean value')
        expect(error.stderr || error.stdout).to.include("Use 'true' or 'false'")
      }
    })

    it('should handle non-existent files gracefully', async function () {
      this.timeout(10000)

      const non_existent = path.join(test_dir, 'non-existent.md')

      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${non_existent}" true`
      )

      expect(stdout).to.include('❌')
      expect(stdout).to.include('File not found')
    })

    it('should reject unsupported file types', async function () {
      this.timeout(10000)

      // Create a text file
      const txt_file = path.join(test_dir, 'test.txt')
      await fs.writeFile(txt_file, 'This is a text file')

      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${txt_file}" true`
      )

      expect(stdout).to.include('❌')
      expect(stdout).to.include('Unsupported file type')
    })
  })

  describe('Summary reporting', function () {
    it('should provide summary of operations', async function () {
      this.timeout(15000)

      // Create multiple files and set them
      const entity_paths = [
        path.join(test_dir, 'summary1.md'),
        path.join(test_dir, 'summary2.md')
      ]

      for (const entity_path of entity_paths) {
        const content = `---
title: ${path.basename(entity_path, '.md')}
type: test
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
user_public_key: test-key
---

Summary test content.`

        await fs.writeFile(entity_path, content)
      }

      const pattern = path.join(test_dir, 'summary*.md')

      // Set all summary files
      const { stdout } = await execute(
        `NODE_ENV=test node ${cli_path} set "${pattern}" true`
      )

      expect(stdout).to.include('📊 Summary:')
      expect(stdout).to.include('Successful: 2')
      expect(stdout).to.include('Failed: 0')
      expect(stdout).to.include('Changed: 2')
    })
  })
})
