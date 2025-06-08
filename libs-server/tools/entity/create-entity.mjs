/**
 * Entity creation tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
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
          base_uri: {
            type: 'string',
            description:
              'The base URI for the new entity file (e.g., user:entity/my-new-entity.md).'
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
        required: ['base_uri', 'title', 'entity_type']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        log(`Creating entity at ${parameters.base_uri}`)

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

        // Get the absolute path using registry
        const absolute_path = resolve_base_uri_from_registry(
          parameters.base_uri
        )

        // Write the entity to the filesystem
        const result = await write_entity_to_filesystem({
          absolute_path,
          entity_properties,
          entity_type: parameters.entity_type,
          entity_content: parameters.entity_content || ''
        })

        return {
          success: true,
          message: `Entity created at ${parameters.base_uri}`,
          entity_id: result.entity_id,
          path: parameters.base_uri
        }
      } catch (error) {
        log(`Error creating entity at ${parameters.base_uri}:`, error)
        return {
          success: false,
          message: `Failed to create entity: ${error.message}`,
          error: error.message
        }
      }
    }
  })
}
