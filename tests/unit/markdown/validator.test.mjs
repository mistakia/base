import { expect } from 'chai'
import { validate_markdown_entity_schema } from '#libs-server/markdown/validation/schema-validator.mjs'

describe('Markdown Validator', () => {
  describe('validate_markdown_entity_schema', () => {
    it('should validate a valid entity', () => {
      // Set up test data
      const formatted_markdown_entity = {
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

      // Call the function
      const result = validate_markdown_entity_schema({
        formatted_markdown_entity,
        schemas
      })

      // Verify results
      expect(result.valid).to.be.true
    })

    it('should return validation errors for an invalid entity', () => {
      // Set up test data
      const formatted_markdown_entity = {
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

      // Call the function
      const result = validate_markdown_entity_schema({
        formatted_markdown_entity,
        schemas
      })

      // Verify results
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
      const formatted_markdown_entity = {
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

      // Call the function
      const result = validate_markdown_entity_schema({
        formatted_markdown_entity,
        schemas
      })

      // Verify results - no schema for unknown_type, so should pass validation
      expect(result.valid).to.be.true
    })
  })
})
