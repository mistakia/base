import { expect } from 'chai'
import { validate_entity_properties } from '#libs-server/entity/validate-schema.mjs'

describe('Entity Validator', () => {
  describe('validate_entity_properties', () => {
    it('should validate a valid entity', async () => {
      // Set up test data
      const entity_properties = {
        title: 'Test Task',
        type: 'task',
        status: 'In Progress',
        priority: 'High'
      }

      const entity_type = 'task'

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      // Call the function
      const result = await validate_entity_properties({
        entity_properties,
        entity_type,
        schemas
      })

      // Verify results
      expect(result.valid).to.be.true
    })

    it('should return validation errors for an invalid entity', async () => {
      // Set up test data
      const entity_properties = {
        title: 'Test Task',
        type: 'task',
        status: 'Invalid Status', // This is not in the enum
        priority: 'Ultra' // This is not in the enum
      }

      const entity_type = 'task'

      const schemas = {
        task: {
          properties: [
            {
              name: 'status',
              type: 'string',
              enum: ['In Progress', 'Completed']
            },
            {
              name: 'priority',
              type: 'string',
              enum: ['High', 'Medium', 'Low']
            }
          ]
        }
      }

      // Call the function
      const result = await validate_entity_properties({
        entity_properties,
        entity_type,
        schemas
      })

      // Verify results
      expect(result.valid).to.be.false
      expect(result.errors).to.be.an('array')
      expect(result.errors.length).to.be.at.least(2)

      // Check that errors mention the invalid fields
      const status_error = result.errors.find((err) => err.includes('status'))
      const priority_error = result.errors.find((err) =>
        err.includes('priority')
      )

      expect(status_error).to.exist
      expect(priority_error).to.exist
    })

    it('should allow entity if no schema exists for its type', async () => {
      // Set up test data
      const entity_properties = {
        title: 'Test Unknown Type',
        type: 'unknown_type',
        custom_field: 'custom value'
      }

      const entity_type = 'unknown_type'

      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] }
          }
        }
      }

      // Call the function
      const result = await validate_entity_properties({
        entity_properties,
        entity_type,
        schemas
      })

      // Verify results - no schema for unknown_type, so should pass validation
      expect(result.valid).to.be.true
    })

    it('should validate against extended schema properties', async () => {
      // Set up test data with extended schema
      const entity_properties = {
        title: 'Extended Task',
        type: 'task',
        status: 'In Progress',
        priority: 'High',
        custom_field: 'custom value' // From extension
      }

      const entity_type = 'task'

      // Schema with extensions already applied
      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
            custom_field: { type: 'string' } // From extension
          },
          extensions: [
            {
              name: 'task_extension',
              git_relative_path: 'schema/task-extension.md'
            }
          ]
        }
      }

      // Call the function
      const result = await validate_entity_properties({
        entity_properties,
        entity_type,
        schemas
      })

      // Verify results - should validate custom_field successfully
      expect(result.valid).to.be.true
    })

    it('should fail when entity properties are missing', async () => {
      // Call with missing entity_properties
      const result = await validate_entity_properties({
        entity_type: 'task',
        schemas: {}
      })

      expect(result.valid).to.be.false
      expect(result.errors).to.include('Entity properties missing or invalid')
    })

    it('should fail when entity type is missing', async () => {
      // Call with missing entity_type
      const result = await validate_entity_properties({
        entity_properties: { title: 'Test' },
        schemas: {}
      })

      expect(result.valid).to.be.false
      expect(result.errors).to.include(
        'Entity type is required for schema validation'
      )
    })
  })
})
