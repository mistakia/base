import { expect } from 'chai'
import path from 'path'
import fs from 'fs'
import generate_guidelines_prompt from '#libs-server/prompts/generate-guidelines-prompt.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'

describe('generate_guidelines_prompt', () => {
  // Test directories
  let test_system_dir
  let test_user_dir

  // Create temporary test directories before tests
  before(async () => {
    // Create temp directories for test guidelines
    test_system_dir = await create_temp_test_directory('system-guidelines-test')
    test_user_dir = await create_temp_test_directory('user-guidelines-test')

    // Create guidelines directories with proper structure
    fs.mkdirSync(path.join(test_system_dir.path, 'system', 'guideline'), {
      recursive: true
    })
    fs.mkdirSync(path.join(test_user_dir.path, 'guideline'), {
      recursive: true
    })
  })

  // Clean up test directories after tests
  after(async () => {
    // Use the cleanup functions provided by create_temp_test_directory
    if (test_system_dir && test_system_dir.cleanup) {
      test_system_dir.cleanup()
    }

    if (test_user_dir && test_user_dir.cleanup) {
      test_user_dir.cleanup()
    }
  })

  // Helper function to create a test guideline file
  const create_guideline_file = ({
    base_dir,
    guideline_directory_type,
    file_name,
    content
  }) => {
    // For system guidelines: base_dir/system/guideline/file_name
    // For user guidelines: base_dir/guideline/file_name
    const file_path =
      guideline_directory_type === 'system'
        ? path.join(base_dir, guideline_directory_type, 'guideline', file_name)
        : path.join(base_dir, 'guideline', file_name)
    fs.writeFileSync(file_path, content, 'utf8')
    return file_path
  }

  describe('with guideline_ids parameter', () => {
    // Create test guideline files before each test in this group
    beforeEach(() => {
      // Create system guideline files
      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'test-guideline1.md',
        content:
          '---\ntitle: Test Guideline 1\ndescription: First test guideline\ntype: guideline\n---\n\n# Test Guideline 1\n\nThis is test content for guideline 1'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'test-guideline2.md',
        content:
          '---\ntitle: Test Guideline 2\ndescription: Second test guideline\ntype: guideline\n---\n\n# Test Guideline 2\n\nThis is test content for guideline 2'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the guidelines directories
      const system_guidelines_dir = path.join(
        test_system_dir.path,
        'system',
        'guideline'
      )
      const user_guidelines_dir = path.join(test_user_dir.path, 'guideline')

      if (fs.existsSync(system_guidelines_dir)) {
        fs.readdirSync(system_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_guidelines_dir, file))
        })
      }

      if (
        fs.existsSync(user_guidelines_dir) &&
        fs.readdirSync(user_guidelines_dir).length > 0
      ) {
        fs.readdirSync(user_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_guidelines_dir, file))
        })
      }
    })

    it('should generate prompt for a single guideline', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/test-guideline1.md'],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<test_guideline1_rules>')
      expect(result).to.include('This is test content for guideline 1')
      expect(result).to.include('</test_guideline1_rules>')
    })

    it('should generate prompt for multiple guidelines', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: [
          'system/test-guideline1.md',
          'system/test-guideline2.md'
        ],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<test_guideline1_rules>')
      expect(result).to.include('This is test content for guideline 1')
      expect(result).to.include('</test_guideline1_rules>')
      expect(result).to.include('<test_guideline2_rules>')
      expect(result).to.include('This is test content for guideline 2')
      expect(result).to.include('</test_guideline2_rules>')
    })

    it('should handle duplicate guideline IDs', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: [
          'system/test-guideline1.md',
          'system/test-guideline1.md'
        ],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<test_guideline1_rules>')
      expect(result).to.include('This is test content for guideline 1')
      expect(result).to.include('</test_guideline1_rules>')

      // The guideline should only appear once
      const matches = result.match(/<test_guideline1_rules>/g)
      expect(matches).to.have.lengthOf(1)
    })

    it('should handle errors when loading guidelines', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/test-guideline1.md', 'system/nonexistent.md'],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<test_guideline1_rules>')
      expect(result).to.include('This is test content for guideline 1')
      expect(result).to.include('</test_guideline1_rules>')
    })

    it('should return empty string when no guidelines are found', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/nonexistent1.md', 'system/nonexistent2.md'],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.equal('')
    })
  })

  describe('with file_path parameter', () => {
    // Create test guideline files with glob patterns before each test
    beforeEach(() => {
      // Create system guideline files with glob patterns
      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'js-guideline.md',
        content:
          '---\ntitle: JS Guideline\ndescription: JavaScript guideline\nglobs: ["*.js", "*.mjs"]\ntype: guideline\n---\n\n# JS Guideline\n\nThis is JavaScript guideline content'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'md-guideline.md',
        content:
          '---\ntitle: Markdown Guideline\ndescription: Markdown guideline\nglobs: ["*.md"]\ntype: guideline\n---\n\n# Markdown Guideline\n\nThis is Markdown guideline content'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'txt-guideline.md',
        content:
          '---\ntitle: Text Guideline\ndescription: Text file guideline\nglobs: ["*.txt"]\ntype: guideline\n---\n\n# Text Guideline\n\nThis is Text file guideline content'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'wildcard-guideline.md',
        content:
          '---\ntitle: Wildcard Guideline\ndescription: Matches everything\nglobs: ["*"]\ntype: guideline\n---\n\n# Wildcard Guideline\n\nThis guideline matches all files'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'no-globs-guideline.md',
        content:
          '---\ntitle: No Globs Guideline\ndescription: No globs specified\ntype: guideline\n---\n\n# No Globs Guideline\n\nThis guideline has no globs'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'empty-globs-guideline.md',
        content:
          '---\ntitle: Empty Globs Guideline\ndescription: Empty globs array\nglobs: []\ntype: guideline\n---\n\n# Empty Globs Guideline\n\nThis guideline has empty globs array'
      })

      // Create user guideline file
      create_guideline_file({
        base_dir: test_user_dir.path,
        guideline_directory_type: 'user',
        file_name: 'user-js-guideline.md',
        content:
          '---\ntitle: User JS Guideline\ndescription: User JavaScript guideline\nglobs: ["*.js"]\ntype: guideline\n---\n\n# User JS Guideline\n\nThis is user JavaScript guideline content'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the guidelines directories
      const system_guidelines_dir = path.join(
        test_system_dir.path,
        'system',
        'guideline'
      )
      const user_guidelines_dir = path.join(test_user_dir.path, 'guideline')

      if (fs.existsSync(system_guidelines_dir)) {
        fs.readdirSync(system_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_guidelines_dir, file))
        })
      }

      if (
        fs.existsSync(user_guidelines_dir) &&
        fs.readdirSync(user_guidelines_dir).length > 0
      ) {
        fs.readdirSync(user_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_guidelines_dir, file))
        })
      }
    })

    it('should find and include guidelines matching the file path', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        file_path: 'example.js',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<js_guideline_rules>')
      expect(result).to.include('This is JavaScript guideline content')
      expect(result).to.include('</js_guideline_rules>')
      expect(result).to.include('<wildcard_guideline_rules>')
      expect(result).to.include('This guideline matches all files')
      expect(result).to.include('</wildcard_guideline_rules>')
      expect(result).to.include('<user_js_guideline_rules>')
      expect(result).to.include('This is user JavaScript guideline content')
      expect(result).to.include('</user_js_guideline_rules>')
    })

    it('should find only guidelines matching the file extension', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        file_path: 'README.md',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<md_guideline_rules>')
      expect(result).to.include('This is Markdown guideline content')
      expect(result).to.include('</md_guideline_rules>')
      expect(result).to.include('<wildcard_guideline_rules>')
      expect(result).to.include('This guideline matches all files')

      // Should not include other guidelines
      expect(result).to.not.include('<js_guideline_rules>')
      expect(result).to.not.include('<txt_guideline_rules>')
      expect(result).to.not.include('<user_js_guideline_rules>')
    })

    it('should not include guidelines not matching the file path', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        file_path: 'example.css', // No guideline matches CSS files except wildcard
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<wildcard_guideline_rules>')
      expect(result).to.include('This guideline matches all files')

      // Should not include other guidelines
      expect(result).to.not.include('<js_guideline_rules>')
      expect(result).to.not.include('<md_guideline_rules>')
      expect(result).to.not.include('<txt_guideline_rules>')
      expect(result).to.not.include('<user_js_guideline_rules>')
    })
  })

  describe('with both guideline_ids and file_path', () => {
    // Create test guideline files before each test
    beforeEach(() => {
      // Create system guideline files
      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'test-guideline1.md',
        content:
          '---\ntitle: Test Guideline 1\ndescription: First test guideline\ntype: guideline\n---\n\n# Test Guideline 1\n\nThis is test content for guideline 1'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'js-guideline.md',
        content:
          '---\ntitle: JS Guideline\ndescription: JavaScript guideline\nglobs: ["*.js", "*.mjs"]\ntype: guideline\n---\n\n# JS Guideline\n\nThis is JavaScript guideline content'
      })

      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'both-guideline.md',
        content:
          '---\ntitle: Both Match Guideline\ndescription: Matches both explicit ID and glob\nglobs: ["*.txt"]\ntype: guideline\n---\n\n# Both Match Guideline\n\nThis guideline should match both ways'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the guidelines directories
      const system_guidelines_dir = path.join(
        test_system_dir.path,
        'system',
        'guideline'
      )
      const user_guidelines_dir = path.join(test_user_dir.path, 'guideline')

      if (fs.existsSync(system_guidelines_dir)) {
        fs.readdirSync(system_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_guidelines_dir, file))
        })
      }

      if (
        fs.existsSync(user_guidelines_dir) &&
        fs.readdirSync(user_guidelines_dir).length > 0
      ) {
        fs.readdirSync(user_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_guidelines_dir, file))
        })
      }
    })

    it('should include both explicit guidelines and matching file path guidelines', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/test-guideline1.md'],
        file_path: 'example.js',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<test_guideline1_rules>')
      expect(result).to.include('This is test content for guideline 1')
      expect(result).to.include('</test_guideline1_rules>')
      expect(result).to.include('<js_guideline_rules>')
      expect(result).to.include('This is JavaScript guideline content')
      expect(result).to.include('</js_guideline_rules>')
    })

    it('should deduplicate guidelines found in both sources', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/both-guideline.md'],
        file_path: 'example.txt',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<both_guideline_rules>')
      expect(result).to.include('This guideline should match both ways')
      expect(result).to.include('</both_guideline_rules>')

      // The guideline should only appear once
      const matches = result.match(/<both_guideline_rules>/g)
      expect(matches).to.have.lengthOf(1)
    })
  })

  describe('edge cases', () => {
    it('should handle guideline without title', async () => {
      // Create guideline without title
      create_guideline_file({
        base_dir: test_system_dir.path,
        guideline_directory_type: 'system',
        file_name: 'no-title.md',
        content:
          '---\ndescription: A guideline without title\ntype: guideline\n---\n\nContent without title'
      })

      // Act
      const result = await generate_guidelines_prompt({
        guideline_ids: ['system/no-title.md'],
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<no_title_rules>')
      expect(result).to.include('Content without title')
      expect(result).to.include('</no_title_rules>')

      // Clean up
      fs.unlinkSync(
        path.join(test_system_dir.path, 'system', 'guideline', 'no-title.md')
      )
    })

    it('should return empty string when no params are provided', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.equal('')
    })
  })
})
