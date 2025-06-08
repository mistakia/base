import { v4 as uuidv4 } from 'uuid'
import debug from 'debug'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { get_git_info_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('test:create-test-entity')

/**
 * Creates a test entity file and adds it to a git repository using the registry system
 *
 * @param {Object} options - Function options
 * @param {string} options.base_uri - URI identifying the entity (e.g., 'sys:entity/name.md', 'user:task/task.md')
 * @param {string} [options.branch='main'] - The Git branch to write to
 * @param {Object} [options.entity_properties] - Custom entity properties (merged with defaults)
 * @param {string} [options.entity_type='text'] - The type of entity being created
 * @param {string} [options.entity_content] - The markdown content (auto-generated if omitted)
 * @param {string} [options.commit_message] - Custom commit message (auto-generated if omitted)
 * @param {string} [options.user_id] - User ID for the entity (auto-generated if omitted)
 * @returns {Promise<Object>} - Object containing entity details and write result
 */
export async function create_test_entity({
  base_uri,
  branch = 'main',
  entity_properties = {},
  entity_type = 'text',
  entity_content,
  commit_message,
  user_id
} = {}) {
  try {
    if (!base_uri) {
      throw new Error('base_uri is required')
    }

    // Generate default values
    const entity_id = entity_properties.entity_id || uuidv4()
    const default_user_id = user_id || uuidv4()
    const default_title = `Test ${entity_type.charAt(0).toUpperCase() + entity_type.slice(1)} Entity`
    const default_description = `This is a test ${entity_type} entity for testing purposes.`

    // Auto-generate entity_content if not provided
    const default_entity_content =
      entity_content ||
      `# ${entity_properties.title || default_title}

This is a test ${entity_type} entity created for testing purposes.

## Content

This entity contains sample content to test the import and processing functionality.

### Features

- Proper frontmatter formatting
- Valid entity structure
- Test-friendly content
`

    // Merge provided properties with defaults
    const merged_entity_properties = {
      entity_id,
      title: default_title,
      description: default_description,
      user_id: default_user_id,
      ...entity_properties // Override defaults with provided properties
    }

    // Auto-generate commit message if not provided
    const default_commit_message =
      commit_message ||
      `Add test ${entity_type} entity: ${merged_entity_properties.title}`

    log(
      `Creating test ${entity_type} entity using registry system with base_uri: ${base_uri}`
    )

    // Get git info for result
    const { git_relative_path, repo_path } =
      get_git_info_from_registry(base_uri)

    // Write using registry system
    const write_result = await write_entity_to_git({
      base_uri,
      entity_properties: merged_entity_properties,
      entity_type,
      branch,
      entity_content: default_entity_content,
      commit_message: default_commit_message
    })

    if (!write_result.success) {
      throw new Error(`Failed to write entity to git: ${write_result.error}`)
    }

    log(`Successfully created test ${entity_type} entity with ID: ${entity_id}`)

    return {
      entity_id,
      entity_properties: merged_entity_properties,
      entity_type,
      entity_content: default_entity_content,
      git_relative_path,
      branch,
      repo_path,
      base_uri,
      write_result
    }
  } catch (error) {
    log('Error creating test entity:', error)
    throw error
  }
}

export default create_test_entity
