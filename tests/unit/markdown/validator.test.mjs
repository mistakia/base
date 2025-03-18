import { expect } from 'chai'
import sinon from 'sinon'
import { validate_entity } from '#libs-server/markdown/validator.mjs'
import schema_module from '#libs-server/markdown/schema.mjs'

describe('Markdown Validator', () => {
  // Create stubs
  let build_validation_schema_stub

  beforeEach(() => {
    // Set up stubs
    build_validation_schema_stub = sinon.stub(
      schema_module,
      'build_validation_schema'
    )
  })

  afterEach(() => {
    // Restore stubs
    sinon.restore()
  })

  describe('validate_entity', () => {
    it('should validate a valid entity', () => {
      // Set up test data
      const parsed_data = {
        frontmatter: {
          title: 'Test Task',
          type: 'task',
          status: 'In Progress',
          priority: 'High'
        }
      }

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      // Mock the schema builder
      build_validation_schema_stub.returns({
        title: { type: 'string', min: 1 },
        type: { type: 'string', enum: ['task'] },
        status: { type: 'string', enum: ['In Progress', 'Completed'] },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
      })

      // Call the function
      const result = validate_entity(parsed_data, schemas)

      // Verify results
      expect(build_validation_schema_stub.calledWith('task', schemas)).to.be
        .true
      expect(result.valid).to.be.true
    })

    it('should return validation errors for an invalid entity', () => {
      // Set up test data
      const parsed_data = {
        frontmatter: {
          title: 'Test Task',
          type: 'task',
          status: 'Invalid Status', // This is not in the enum
          priority: 'Ultra' // This is not in the enum
        }
      }

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      // Mock the schema builder
      build_validation_schema_stub.returns({
        title: { type: 'string', min: 1 },
        type: { type: 'string', enum: ['task'] },
        status: { type: 'string', enum: ['In Progress', 'Completed'] },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
      })

      // Call the function
      const result = validate_entity(parsed_data, schemas)

      // Verify results
      expect(build_validation_schema_stub.calledWith('task', schemas)).to.be
        .true
      expect(result.valid).to.be.false
      expect(result.errors).to.be.an('array')

      // Check that errors mention the invalid fields
      const status_error = result.errors.find((err) => err.field === 'status')
      const priority_error = result.errors.find(
        (err) => err.field === 'priority'
      )

      expect(status_error).to.exist
      expect(priority_error).to.exist
    })

    it('should allow entity if no schema exists for its type', () => {
      // Set up test data
      const parsed_data = {
        frontmatter: {
          title: 'Test Unknown Type',
          type: 'unknown_type',
          custom_field: 'custom value'
        }
      }

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] }
          }
        }
      }

      // Mock the schema builder to return null (no schema found)
      build_validation_schema_stub.returns(null)

      // Call the function
      const result = validate_entity(parsed_data, schemas)

      // Verify results
      expect(build_validation_schema_stub.calledWith('unknown_type', schemas))
        .to.be.true
      expect(result.valid).to.be.true // Should be valid as we allow entities without schema
    })
  })
})
