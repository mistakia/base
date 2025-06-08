import { expect } from 'chai'
import path from 'path'
import fs from 'fs'
import generate_guidelines_prompt from '#libs-server/prompts/generate-guidelines-prompt.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

describe('generate_guidelines_prompt', () => {
  // Test repository
  let test_repo

  // Create temporary test repository before tests
  before(async () => {
    test_repo = await create_temp_test_repo()
  })

  // Clean up test repository after tests
  after(async () => {
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }
  })

  // Helper function to create a test guideline file
  const create_guideline_file = ({ base_uri, content, is_user = false }) => {
    const repo_path = is_user ? test_repo.user_path : test_repo.system_path
    const relative_path = 'guideline/' + base_uri.split('/').pop()
    const absolute_path = path.join(repo_path, relative_path)
    fs.mkdirSync(path.dirname(absolute_path), { recursive: true })
    fs.writeFileSync(absolute_path, content, 'utf8')
    return base_uri
  }

  describe('with guideline_base_uris parameter', () => {
    // Create test guideline files before each test in this group
    beforeEach(() => {
      // Create system guideline files
      create_guideline_file({
        base_uri: 'sys:guideline/test-guideline1.md',
        content:
          '---\ntitle: Test Guideline 1\ndescription: First test guideline\ntype: guideline\n---\n\n# Test Guideline 1\n\nThis is test content for guideline 1'
      })

      create_guideline_file({
        base_uri: 'sys:guideline/test-guideline2.md',
        content:
          '---\ntitle: Test Guideline 2\ndescription: Second test guideline\ntype: guideline\n---\n\n# Test Guideline 2\n\nThis is test content for guideline 2'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the guidelines directories
      const system_guidelines_dir = path.join(
        test_repo.system_path,
        'guideline'
      )
      const user_guidelines_dir = path.join(test_repo.user_path, 'guideline')

      if (fs.existsSync(system_guidelines_dir)) {
        fs.readdirSync(system_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_guidelines_dir, file))
        })
      }

      if (fs.existsSync(user_guidelines_dir)) {
        fs.readdirSync(user_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_guidelines_dir, file))
        })
      }
    })

    it('should generate prompt for a single guideline', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_base_uris: ['sys:guideline/test-guideline1.md']
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
        guideline_base_uris: [
          'sys:guideline/test-guideline1.md',
          'sys:guideline/test-guideline2.md'
        ]
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

    it('should handle duplicate guideline paths', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_base_uris: [
          'sys:guideline/test-guideline1.md',
          'sys:guideline/test-guideline1.md'
        ]
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
        guideline_base_uris: [
          'sys:guideline/test-guideline1.md',
          'sys:guideline/nonexistent.md'
        ]
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
        guideline_base_uris: [
          'sys:guideline/nonexistent1.md',
          'sys:guideline/nonexistent2.md'
        ]
      })

      // Assert
      expect(result).to.equal('')
    })
  })

  describe('with user guidelines', () => {
    beforeEach(() => {
      // Create user guideline file
      create_guideline_file({
        base_uri: 'user:guideline/user-guideline.md',
        content:
          '---\ntitle: User Guideline\ndescription: User test guideline\ntype: guideline\n---\n\n# User Guideline\n\nThis is user guideline content',
        is_user: true
      })
    })

    afterEach(() => {
      const user_guidelines_dir = path.join(test_repo.user_path, 'guideline')
      if (fs.existsSync(user_guidelines_dir)) {
        fs.readdirSync(user_guidelines_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_guidelines_dir, file))
        })
      }
    })

    it('should include user guidelines', async () => {
      // Act
      const result = await generate_guidelines_prompt({
        guideline_base_uris: ['user:guideline/user-guideline.md']
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<user_guideline_rules>')
      expect(result).to.include('This is user guideline content')
      expect(result).to.include('</user_guideline_rules>')
    })
  })

  describe('edge cases', () => {
    it('should handle guideline without title', async () => {
      // Create guideline without title
      create_guideline_file({
        base_uri: 'sys:guideline/no-title.md',
        content:
          '---\ndescription: A guideline without title\ntype: guideline\n---\n\nContent without title'
      })

      // Act
      const result = await generate_guidelines_prompt({
        guideline_base_uris: ['sys:guideline/no-title.md']
      })

      // Assert
      expect(result).to.be.a('string')
      expect(result).to.include('<no_title_rules>')
      expect(result).to.include('Content without title')
      expect(result).to.include('</no_title_rules>')

      // Clean up
      fs.unlinkSync(
        path.join(test_repo.system_path, 'guideline', 'no-title.md')
      )
    })

    it('should return empty string when no params are provided', async () => {
      // Act
      const result = await generate_guidelines_prompt({})

      // Assert
      expect(result).to.equal('')
    })
  })
})
