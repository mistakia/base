/**
 * Entity creation tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { validate_entity_from_filesystem } from '#libs-server/entity/filesystem/validate-entity-from-filesystem.mjs'
import config from '#config'

// Setup logger
const log = debug('tools:entity:create')

export function register_entity_create_tool() {
  log('Registering entity_create tool')

  register_tool({
    tool_name: 'entity_create',
    tool_definition: {
      description:
        'Creates a new entity file in the filesystem with the specified properties.',
      inputSchema: {
        type: 'object',
        properties: {
          base_relative_path: {
            type: 'string',
            description:
              'The base relative path for the new entity file (e.g., user/entity/my-new-entity.md).'
          },
          title: {
            type: 'string',
            description: 'The title of the entity.'
          },
          entity_type: {
            type: 'string',
            description: 'The type of entity to create.'
          },
          description: {
            type: 'string',
            description: 'A description of the entity.'
          },
          entity_content: {
            type: 'string',
            description: 'The content of the entity file (markdown).'
          },
          entity_properties: {
            type: 'object',
            description: 'Additional properties for the entity.'
          },
          user_id: {
            type: 'string',
            description:
              'Optional: User ID for ownership/context. Defaults to configured user.'
          }
        },
        required: ['base_relative_path', 'title', 'entity_type']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        log(`Creating entity at ${parameters.base_relative_path}`)

        // Build entity properties
        const entity_properties = {
          title: parameters.title,
          ...(parameters.entity_properties || {}),
          ...(parameters.description
            ? { description: parameters.description }
            : {}),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: parameters.user_id || context.user_id || config.user_id
        }

        // Get the absolute path
        const absolute_path = `${config.root_base_directory}/${parameters.base_relative_path}`

        // Write the entity to the filesystem
        const result = await write_entity_to_filesystem({
          absolute_path,
          entity_properties,
          entity_type: parameters.entity_type,
          entity_content: parameters.entity_content || ''
        })

        // Validate the entity after writing
        await validate_entity_from_filesystem({
          absolute_path
        })

        return {
          success: true,
          message: `Entity created at ${parameters.base_relative_path}`,
          entity_id: result.entity_id,
          path: parameters.base_relative_path
        }
      } catch (error) {
        log(`Error creating entity at ${parameters.base_relative_path}:`, error)
        return {
          success: false,
          message: `Failed to create entity: ${error.message}`,
          error: error.message
        }
      }
    }
  })
}
