import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ajv = new Ajv()
addFormats(ajv)

// Load the thread metadata schema
const schema_path = path.resolve('system/text/thread-metadata-schema.json')

describe('Thread Metadata Schema Validation', () => {
  let schema
  let validate

  before(async () => {
    const schema_content = await fs.readFile(schema_path, 'utf-8')
    schema = JSON.parse(schema_content)
    validate = ajv.compile(schema)
  })

  describe('Schema Structure', () => {
    it('should have correct required fields', () => {
      expect(schema.required).to.deep.equal([
        'thread_id',
        'user_public_key',
        'thread_state',
        'created_at',
        'updated_at'
      ])
    })

    it('should include title and short_description as optional properties', () => {
      expect(schema.properties).to.have.property('title')
      expect(schema.properties).to.have.property('short_description')
      expect(schema.required).to.not.include('title')
      expect(schema.required).to.not.include('short_description')
    })

    it('should have correct title property definition', () => {
      const title_property = schema.properties.title
      expect(title_property.type).to.equal('string')
      expect(title_property.description).to.equal(
        'Human-readable title for the thread (optional)'
      )
    })

    it('should have correct short_description property definition', () => {
      const description_property = schema.properties.short_description
      expect(description_property.type).to.equal('string')
      expect(description_property.description).to.equal(
        "Brief description of the thread's purpose or content (optional)"
      )
    })
  })

  describe('Schema Validation - Valid Cases', () => {
    it('should validate metadata without title or description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with title only', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: 'My Test Thread'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with description only', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        short_description: 'This is a test thread for validation'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with both title and description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: 'My Test Thread',
        short_description: 'This is a test thread for validation'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with empty title and description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: '',
        short_description: ''
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })
  })

  describe('Schema Validation - Invalid Cases', () => {
    it('should reject metadata with non-string title', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: 123
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(false)
      expect(validate.errors).to.have.length(1)
      expect(validate.errors[0].instancePath).to.equal('/title')
      expect(validate.errors[0].keyword).to.equal('type')
    })

    it('should reject metadata with non-string short_description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        short_description: ['not', 'a', 'string']
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(false)
      expect(validate.errors).to.have.length(1)
      expect(validate.errors[0].instancePath).to.equal('/short_description')
      expect(validate.errors[0].keyword).to.equal('type')
    })

    it('should reject metadata with legacy source key at root', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        source: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(false)
      const additional_error = validate.errors.find(
        (error) =>
          error.keyword === 'additionalProperties' &&
          error.params.additionalProperty === 'source'
      )
      expect(additional_error).to.exist
    })

    it('should reject metadata with null title when provided', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: null
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(false)
      expect(validate.errors).to.have.length(1)
      expect(validate.errors[0].instancePath).to.equal('/title')
      expect(validate.errors[0].keyword).to.equal('type')
    })
  })

  describe('Backward Compatibility', () => {
    it('should validate existing metadata files without title/description fields', async () => {
      // Test with a sample of what existing metadata.json files look like
      const existing_metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        external_session: { provider: 'claude' },
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        prompt_properties: {},
        tools: ['task_create', 'file_read']
      }

      const is_valid = validate(existing_metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should maintain all existing required fields', () => {
      const metadata_missing_required = {
        // Missing thread_id - should fail
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      }

      const is_valid = validate(metadata_missing_required)
      expect(is_valid).to.equal(false)
      expect(validate.errors).to.be.an('array')
      const required_error = validate.errors.find(
        (error) =>
          error.keyword === 'required' &&
          error.params.missingProperty === 'thread_id'
      )
      expect(required_error).to.exist
    })
  })

  describe('Execution Attribution', () => {
    const base_metadata = () => ({
      thread_id: '123e4567-e89b-12d3-a456-426614174000',
      user_public_key:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      external_session: { provider: 'claude' },
      thread_state: 'active',
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z'
    })

    it('should validate metadata with controlled_host execution', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'controlled_host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null
        }
      }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with controlled_host execution and account_namespace', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'controlled_host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null,
          account_namespace: 'fee.trace.wrap'
        }
      }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with shared controlled_container execution', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'controlled_container',
          machine_id: 'storage',
          container_runtime: 'docker',
          container_name: 'base-container'
        }
      }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with per-user container execution', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'controlled_container',
          machine_id: 'storage',
          container_runtime: 'docker',
          container_name: 'base-user-arrin'
        }
      }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with provider_hosted execution', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'provider_hosted',
          machine_id: null,
          container_runtime: null,
          container_name: null
        }
      }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should validate metadata with execution explicitly null', () => {
      const metadata = { ...base_metadata(), execution: null }
      expect(validate(metadata)).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should reject execution with legacy mode field', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          mode: 'host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null
        }
      }
      expect(validate(metadata)).to.equal(false)
    })

    it('should reject execution with unknown environment value', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'wat',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null
        }
      }
      expect(validate(metadata)).to.equal(false)
    })

    it('should reject execution with unknown additional property', () => {
      const metadata = {
        ...base_metadata(),
        execution: {
          environment: 'controlled_host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null,
          execution_mode: 'host'
        }
      }
      expect(validate(metadata)).to.equal(false)
    })

    it('should reject execution missing required keys', () => {
      const metadata = {
        ...base_metadata(),
        execution: { environment: 'controlled_host' }
      }
      expect(validate(metadata)).to.equal(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long title strings', () => {
      const long_title = 'A'.repeat(1000) // Very long title
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: long_title
      }

      const is_valid = validate(metadata)
      // Schema validation should pass (length constraints are enforced at application level)
      expect(is_valid).to.equal(true)
    })

    it('should handle special characters in title and description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: '🚀 Test Thread with émojis & spëcial chars!',
        short_description:
          'Description with "quotes", <tags>, & other symbols: @#$%^&*()'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })

    it('should handle unicode characters in title and description', () => {
      const metadata = {
        thread_id: '123e4567-e89b-12d3-a456-426614174000',
        user_public_key:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        external_session: { provider: 'claude' },
        workflow_base_uri: 'sys:system/workflow/test-workflow.md',
        thread_state: 'active',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        title: '测试线程标题 - 中文',
        short_description: 'مقال تجريبي - وصف باللغة العربية'
      }

      const is_valid = validate(metadata)
      expect(is_valid).to.equal(true)
      expect(validate.errors).to.be.null
    })
  })
})
