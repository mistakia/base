/**
 * Entity subcommand group
 *
 * Wraps entity query, get, move, and validate operations.
 */

import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { list_entities } from '#cli/entity-list.mjs'
import { move_entity_filesystem } from '#libs-server/entity/filesystem/move-entity-filesystem.mjs'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  parse_time_period_date,
  parse_time_period_ms,
  is_valid_time_period
} from '#libs-server/utils/parse-time-period.mjs'
import {
  SERVER_URL,
  format_entity,
  format_entity_thread,
  output_results,
  flush_and_exit
} from './lib/format.mjs'
import { query, api_get, api_mutate } from './lib/data-access.mjs'
import {
  validate_boolean,
  parse_boolean,
  process_file,
  find_matching_files,
  get_visibility
} from '#cli/entity-visibility.mjs'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { create_share_token } from '#libs-server/share-token/create-share-token.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import {
  resolve_base_uri_from_registry,
  is_valid_base_uri,
  create_base_uri_from_path,
  get_expected_type_for_path
} from '#libs-server/base-uri/index.mjs'
import config from '#config'
import { sync_task_to_github } from '#libs-server/integrations/github/sync-task-to-github.mjs'

export const command = 'entity <command>'
export const describe =
  'Entity operations (create, convert, list, get, update, observe, tree, move, validate, visibility)'

export const builder = (yargs) =>
  yargs
    .command(
      'create <base_uri>',
      'Create a new entity file with auto-generated id and timestamps',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe:
              'Base URI for the entity (e.g., user:task/my-task.md, user:text/doc.md)',
            type: 'string'
          })
          .option('title', {
            alias: 't',
            describe: 'Entity title',
            type: 'string',
            demandOption: true
          })
          .option('type', {
            describe:
              'Entity type (task, text, workflow, guideline, tag, etc.)',
            type: 'string',
            demandOption: true
          })
          .option('description', {
            alias: 'd',
            describe: 'Brief description',
            type: 'string'
          })
          .option('content', {
            alias: 'c',
            describe:
              'Markdown content after frontmatter (use "-" to read from stdin)',
            type: 'string',
            default: ''
          })
          .option('content-file', {
            describe: 'Read markdown content from a file path',
            type: 'string'
          })
          .option('properties', {
            alias: 'p',
            describe: 'Additional properties as JSON string',
            type: 'string'
          })
          .option('public-read', {
            describe: 'Set entity as publicly readable',
            type: 'boolean',
            default: false
          })
          .option('force', {
            alias: 'f',
            describe: 'Overwrite existing entity file',
            type: 'boolean',
            default: false
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview without writing',
            type: 'boolean',
            default: false
          }),
      handle_create
    )
    .command(
      'list',
      'Query entities with filters',
      (yargs) =>
        yargs
          .option('type', {
            alias: 't',
            describe: 'Entity type(s)',
            type: 'array'
          })
          .option('status', {
            describe: 'Status filter',
            type: 'string'
          })
          .option('priority', {
            describe: 'Priority filter',
            type: 'string'
          })
          .option('tags', {
            describe: 'Tag base_uris',
            type: 'array'
          })
          .option('without-tags', {
            describe: 'Return only entities without tags',
            type: 'boolean',
            default: false
          })
          .option('archived', {
            describe: 'Include archived entities',
            type: 'boolean',
            default: false
          })
          .option('search', {
            alias: 's',
            describe: 'Search term for title',
            type: 'string'
          })
          .option('fields', {
            alias: 'f',
            describe: 'Fields to return',
            type: 'array'
          })
          .option('content', {
            describe: 'Include entity content',
            type: 'boolean',
            default: false
          })
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 50
          })
          .option('offset', {
            describe: 'Offset for pagination',
            type: 'number',
            default: 0
          })
          .option('sort', {
            describe: 'Sort field',
            type: 'string',
            default: 'updated_at'
          })
          .option('asc', {
            describe: 'Sort ascending',
            type: 'boolean',
            default: false
          })
          .option('recently-active', {
            describe: 'Filter by recent thread activity (e.g., 24h, 7d, 2w)',
            type: 'string'
          }),
      handle_list
    )
    .command(
      'get <base_uri>',
      'Get single entity by base_uri',
      (yargs) =>
        yargs.positional('base_uri', {
          describe: 'Entity base_uri',
          type: 'string'
        }),
      handle_get
    )
    .command(
      'update <base_uri>',
      'Update entity properties (status, priority, tags, arbitrary fields)',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Entity base_uri',
            type: 'string'
          })
          .option('status', {
            describe: 'New status value',
            type: 'string'
          })
          .option('priority', {
            describe: 'New priority value',
            type: 'string'
          })
          .option('properties', {
            alias: 'p',
            describe: 'Additional properties as JSON string',
            type: 'string'
          })
          .option('tags', {
            describe: 'Comma-separated tag URIs (replaces existing tags)',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes without executing',
            type: 'boolean',
            default: false
          })
          .option('no-sync', {
            describe: 'Skip GitHub project field sync',
            type: 'boolean',
            default: false
          })
          .check((argv) => {
            if (
              !argv.status &&
              !argv.priority &&
              !argv.properties &&
              !argv.tags
            ) {
              throw new Error(
                'At least one of --status, --priority, --properties, or --tags is required'
              )
            }
            return true
          }),
      handle_update
    )
    .command(
      'observe <base_uri> <observation>',
      'Add an observation to entity frontmatter (see sys:system/guideline/write-observations.md)',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Entity base_uri',
            type: 'string'
          })
          .positional('observation', {
            describe:
              'Observation text (should start with [category], e.g. "[blocked] waiting on X")',
            type: 'string'
          }),
      handle_observe
    )
    .command(
      'tree [base_uri]',
      'Display task dependency tree',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Task base_uri to show tree for',
            type: 'string'
          })
          .option('depth', {
            alias: 'd',
            describe: 'Maximum depth to traverse',
            type: 'number',
            default: 5
          })
          .option('relation-type', {
            alias: 'r',
            describe: 'Comma-separated relation types to traverse',
            type: 'string'
          })
          .option('status', {
            alias: 's',
            describe: 'Comma-separated entity statuses to include',
            type: 'string'
          })
          .option('project', {
            alias: 'p',
            describe: 'Tag URI for project-wide dependency graph',
            type: 'string'
          }),
      handle_tree
    )
    .command(
      'move <source> <destination>',
      'Move entity and update references',
      (yargs) =>
        yargs
          .positional('source', {
            describe: 'Source path or base_uri',
            type: 'string'
          })
          .positional('destination', {
            describe: 'Destination path or base_uri',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes without executing',
            type: 'boolean',
            default: false
          })
          .option('include-path-patterns', {
            alias: 'i',
            describe: 'Limit reference scan to matching paths',
            type: 'array',
            default: []
          })
          .option('exclude-path-patterns', {
            alias: 'e',
            describe: 'Exclude paths from reference scan',
            type: 'array',
            default: []
          }),
      handle_move
    )
    .command(
      'validate',
      'Validate markdown entities against schemas',
      (yargs) =>
        yargs
          .option('include-path-patterns', {
            alias: 'i',
            describe: 'Glob patterns to include',
            type: 'array',
            default: []
          })
          .option('exclude-path-patterns', {
            alias: 'e',
            describe: 'Glob patterns to exclude',
            type: 'array',
            default: []
          })
          .option('strict', {
            describe: 'Promote warnings to errors',
            type: 'boolean',
            default: false
          }),
      handle_validate
    )
    .command(
      'threads <base_uri>',
      'Show threads that have worked on or referenced an entity',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Entity base_uri to find related threads for',
            type: 'string'
          })
          .option('relation-type', {
            describe:
              'Filter by relation type (modifies, accesses, creates, relates_to)',
            type: 'string'
          })
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 50
          })
          .option('offset', {
            describe: 'Offset for pagination',
            type: 'number',
            default: 0
          }),
      handle_threads
    )
    .command(
      'visibility <command>',
      'Manage public_read visibility settings',
      (yargs) =>
        yargs
          .command(
            'set <pattern> <value>',
            'Set public_read for files matching pattern',
            (yargs) =>
              yargs
                .positional('pattern', {
                  describe: 'File path or glob pattern to match files',
                  type: 'string'
                })
                .positional('value', {
                  describe: 'Boolean value: true or false',
                  type: 'string'
                })
                .option('dry-run', {
                  describe: 'Preview changes without applying them',
                  type: 'boolean',
                  default: false
                }),
            handle_visibility_set
          )
          .command(
            'get <pattern>',
            'Show current public_read values for matching files',
            (yargs) =>
              yargs.positional('pattern', {
                describe: 'File path or glob pattern to match files',
                type: 'string'
              }),
            handle_visibility_get
          )
          .demandCommand(1, 'Specify a subcommand: set or get')
    )
    .command(
      'convert <path>',
      'Convert a plain markdown file into a proper entity with frontmatter',
      (yargs) =>
        yargs
          .positional('path', {
            describe: 'Filesystem path or base_uri of the file to convert',
            type: 'string'
          })
          .option('type', {
            describe:
              'Entity type (task, text, workflow, guideline, tag, etc.)',
            type: 'string'
          })
          .option('title', {
            alias: 't',
            describe:
              'Entity title (overrides existing frontmatter or heading)',
            type: 'string'
          })
          .option('description', {
            alias: 'd',
            describe: 'Brief description',
            type: 'string'
          })
          .option('properties', {
            alias: 'p',
            describe: 'Additional properties as JSON string',
            type: 'string'
          })
          .option('force', {
            alias: 'f',
            describe: 'Override path-type consistency check',
            type: 'boolean',
            default: false
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview without writing',
            type: 'boolean',
            default: false
          }),
      handle_convert
    )
    .command(
      'references <base_uri>',
      'List all sources (entities + threads) that reference a given base_uri',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Target base_uri to find inbound references for',
            type: 'string'
          })
          .option('json', {
            describe: 'Output as a flat JSON array',
            type: 'boolean',
            default: false
          }),
      handle_references
    )
    .command(
      'validate-references',
      'Detect dangling references (entity relations, tags, content wikilinks, thread metadata)',
      (yargs) =>
        yargs.option('json', {
          describe: 'Output as JSON',
          type: 'boolean',
          default: false
        }),
      handle_validate_references
    )
    .command(
      'share <base_uri>',
      'Generate a share link for an entity',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe:
              'Base URI of the entity to share (e.g., user:task/my-task.md)',
            type: 'string'
          })
          .option('expires', {
            alias: 'e',
            describe:
              'Expiration as duration (7d, 24h, 2w, 1m) or ISO 8601 timestamp (2026-04-15T00:00:00Z). Default: no expiry',
            type: 'string'
          })
          .option('private-key', {
            alias: 'k',
            describe:
              'Ed25519 private key hex (or set USER_PRIVATE_KEY env var)',
            type: 'string'
          }),
      handle_share
    )
    .demandCommand(
      1,
      'Specify a subcommand: create, list, get, update, observe, tree, move, validate, validate-references, references, convert, threads, visibility, or share'
    )

export const handler = () => {}

async function read_stdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function resolve_content(argv) {
  if (argv['content-file']) {
    return await fs.readFile(argv['content-file'], 'utf8')
  }
  if (argv.content === '-') {
    return await read_stdin()
  }
  return argv.content || ''
}

async function handle_create(argv) {
  let exit_code = 0
  try {
    const { base_uri, title, description } = argv
    const content = await resolve_content(argv)
    const entity_type = argv.type

    let extra_properties = {}
    if (argv.properties) {
      try {
        extra_properties = JSON.parse(argv.properties)
      } catch {
        throw new Error(`Invalid JSON for --properties: ${argv.properties}`)
      }
    }

    if (extra_properties.type !== undefined) {
      console.error(
        'Warning: "type" in --properties is ignored; use --type flag instead'
      )
      delete extra_properties.type
    }

    const entity_properties = {
      title,
      ...extra_properties,
      ...(description ? { description } : {}),
      base_uri,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_public_key: config.user_public_key,
      public_read: Boolean(argv['public-read'])
    }

    const absolute_path = resolve_base_uri_from_registry(base_uri)

    const expected_type = get_expected_type_for_path({ absolute_path })
    if (expected_type && expected_type !== entity_type && !argv.force) {
      const first_segment = expected_type
      throw new Error(
        `Type mismatch: file at ${first_segment}/ expects type "${expected_type}" but got "${entity_type}". Use --force to override.`
      )
    }

    if (existsSync(absolute_path) && !argv.force) {
      throw new Error(
        `Entity already exists at ${absolute_path}. Use --force to overwrite.`
      )
    }

    if (argv['dry-run']) {
      if (argv.json) {
        console.log(
          JSON.stringify(
            {
              dry_run: true,
              base_uri,
              absolute_path,
              entity_type,
              entity_properties
            },
            null,
            2
          )
        )
      } else {
        console.log('Dry run - no changes made')
        console.log(`  Path: ${absolute_path}`)
        console.log(`  Type: ${entity_type}`)
        console.log(`  Title: ${title}`)
        if (description) console.log(`  Description: ${description}`)
        if (Object.keys(extra_properties).length > 0) {
          console.log(`  Properties: ${JSON.stringify(extra_properties)}`)
        }
        console.log(`  Public read: ${entity_properties.public_read}`)
      }
      flush_and_exit(0)
      return
    }

    const result = await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content: content || ''
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            entity_id: result.entity_id,
            base_uri,
            path: absolute_path
          },
          null,
          2
        )
      )
    } else {
      console.log(`Created ${entity_type} entity at ${base_uri}`)
      console.log(`  Entity ID: ${result.entity_id}`)
      console.log(`  Path: ${absolute_path}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

function extract_title_from_heading(content) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

function title_from_filename(absolute_path) {
  const basename = path.basename(absolute_path, path.extname(absolute_path))
  return basename
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function handle_convert(argv) {
  let exit_code = 0
  try {
    const input_path = argv.path

    // Resolve to absolute path: accept base_uri or filesystem path
    let absolute_path
    if (is_valid_base_uri(input_path)) {
      absolute_path = resolve_base_uri_from_registry(input_path)
    } else if (path.isAbsolute(input_path)) {
      absolute_path = input_path
    } else {
      absolute_path = path.resolve(config.user_base_directory, input_path)
    }

    // Read the file
    const file_content = await fs.readFile(absolute_path, 'utf-8')

    // Parse existing frontmatter and content
    const { document_properties, document_content } =
      format_document_from_file_content({
        file_content,
        file_path: absolute_path
      })

    // Determine base_uri for the file
    const base_uri = create_base_uri_from_path(absolute_path)

    // Determine entity type
    const entity_type = argv.type || document_properties.type
    if (!entity_type) {
      throw new Error(
        'Entity type could not be determined. Use --type to specify.'
      )
    }

    // Determine title
    const title =
      argv.title ||
      document_properties.title ||
      extract_title_from_heading(document_content) ||
      title_from_filename(absolute_path)

    // Determine description
    const description = argv.description || document_properties.description

    // Parse extra properties from --properties flag
    let extra_properties = {}
    if (argv.properties) {
      try {
        extra_properties = JSON.parse(argv.properties)
      } catch {
        throw new Error(`Invalid JSON for --properties: ${argv.properties}`)
      }
    }

    if (extra_properties.type !== undefined) {
      console.error(
        'Warning: "type" in --properties is ignored; use --type flag instead'
      )
      delete extra_properties.type
    }

    const expected_type = get_expected_type_for_path({ absolute_path })
    if (expected_type && expected_type !== entity_type && !argv.force) {
      throw new Error(
        `Type mismatch: file at ${expected_type}/ expects type "${expected_type}" but got "${entity_type}". Use --force to override.`
      )
    }

    // Check if already a valid entity with no flags provided
    const has_entity_id = Boolean(document_properties.entity_id)
    const has_type = Boolean(document_properties.type)
    const has_title = Boolean(document_properties.title)
    const no_flags_provided =
      !argv.type && !argv.title && !argv.description && !argv.properties
    if (has_entity_id && has_type && has_title && no_flags_provided) {
      if (argv.json) {
        console.log(
          JSON.stringify(
            {
              already_valid: true,
              base_uri,
              entity_id: document_properties.entity_id,
              path: absolute_path
            },
            null,
            2
          )
        )
      } else {
        console.log(`Already a valid entity: ${base_uri}`)
        console.log(`  Entity ID: ${document_properties.entity_id}`)
        console.log(`  Type: ${document_properties.type}`)
        console.log(`  Title: ${document_properties.title}`)
      }
      flush_and_exit(0)
      return
    }

    // Merge properties: existing frontmatter < generated fields < flags
    const now = new Date().toISOString()
    const entity_properties = {
      ...document_properties,
      title,
      type: entity_type,
      ...(description ? { description } : {}),
      ...extra_properties,
      created_at: document_properties.created_at || now,
      updated_at: now,
      user_public_key:
        document_properties.user_public_key || config.user_public_key,
      base_uri
    }

    if (argv['dry-run']) {
      if (argv.json) {
        console.log(
          JSON.stringify(
            {
              dry_run: true,
              base_uri,
              absolute_path,
              entity_type,
              entity_properties,
              content_length: document_content.length
            },
            null,
            2
          )
        )
      } else {
        console.log('Dry run - no changes made')
        console.log(`  Path: ${absolute_path}`)
        console.log(`  Base URI: ${base_uri}`)
        console.log(`  Type: ${entity_type}`)
        console.log(`  Title: ${title}`)
        if (description) console.log(`  Description: ${description}`)
        if (Object.keys(extra_properties).length > 0) {
          console.log(`  Properties: ${JSON.stringify(extra_properties)}`)
        }
        console.log(`  Content length: ${document_content.length} chars`)
        console.log(
          `  Existing entity_id: ${document_properties.entity_id || 'none (will be generated)'}`
        )
      }
      flush_and_exit(0)
      return
    }

    const result = await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content: document_content
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            entity_id: result.entity_id,
            base_uri,
            path: absolute_path,
            converted: true
          },
          null,
          2
        )
      )
    } else {
      console.log(`Converted to ${entity_type} entity: ${base_uri}`)
      console.log(`  Entity ID: ${result.entity_id}`)
      console.log(`  Title: ${title}`)
      console.log(`  Path: ${absolute_path}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function fetch_entities_from_api(argv) {
  const params = new URLSearchParams()
  if (argv.type) {
    for (const t of argv.type) params.append('type', t)
  }
  if (argv.status) params.set('status', argv.status)
  if (argv.priority) params.set('priority', argv.priority)
  if (argv.tags) {
    for (const tag of argv.tags) params.append('tags', tag)
  }
  if (argv['without-tags']) params.set('without_tags', 'true')
  if (argv.archived) params.set('include_archived', 'true')
  if (argv.search) params.set('search', argv.search)
  if (argv.content) params.set('content', 'true')
  if (argv.limit) params.set('limit', String(argv.limit))
  if (argv.offset) params.set('offset', String(argv.offset))
  if (argv.sort) params.set('sort_by', argv.sort)
  if (!argv.asc) params.set('sort_desc', 'true')

  const data = await api_get('/api/entities', params)
  return data.entities || data
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    let entities

    // Handle recently-active filter (uses separate query)
    if (argv['recently-active']) {
      const period = argv['recently-active']
      if (!is_valid_time_period(period)) {
        throw new Error(
          `Invalid period format: ${period}. Use format like 24h, 7d, 2w, 1m`
        )
      }

      const since_date = parse_time_period_date(period)

      entities = await embedded_index_manager.query_entities_by_thread_activity(
        {
          since_date,
          entity_types: argv.type || null,
          limit: argv.limit,
          offset: argv.offset
        }
      )
    } else {
      entities = await query(
        () => fetch_entities_from_api(argv),
        () =>
          list_entities({
            types: argv.type,
            status: argv.status,
            priority: argv.priority,
            tags: argv.tags,
            no_tags: argv['without-tags'],
            include_archived: argv.archived,
            search: argv.search,
            fields: argv.fields,
            content: argv.content,
            limit: argv.limit,
            offset: argv.offset,
            sort_by: argv.sort,
            sort_desc: !argv.asc,
            verbose: argv.verbose
          })
      )
    }

    output_results(entities, {
      json: argv.json,
      verbose: argv.verbose,
      formatter: (entity) =>
        format_entity(entity, { verbose: argv.verbose, fields: argv.fields }),
      empty_message: 'No entities found'
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_get(argv) {
  let exit_code = 0
  try {
    const entities = await query(
      async () => {
        const params = new URLSearchParams({
          base_uri: argv.base_uri,
          content: 'true'
        })
        const data = await api_get('/api/entities', params)
        return data.entities || data
      },
      () =>
        list_entities({
          one: true,
          base_uri: argv.base_uri,
          content: true
        })
    )

    const verbose = argv.verbose !== undefined ? argv.verbose : true
    output_results(entities, {
      json: argv.json,
      verbose,
      formatter: (entity) => format_entity(entity, { verbose }),
      empty_message: `Entity not found: ${argv.base_uri}`
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_move(argv) {
  let exit_code = 0
  try {
    const result = await move_entity_filesystem({
      source_path: argv.source,
      destination_path: argv.destination,
      dry_run: argv['dry-run'],
      include_path_patterns: argv['include-path-patterns'],
      exclude_path_patterns: argv['exclude-path-patterns']
    })

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      if (result.dry_run) {
        console.log('Dry run - no changes made')
      } else if (result.success) {
        console.log('Entity moved successfully')
      } else {
        console.log('Move operation failed')
      }
      console.log(`Source: ${result.source_base_uri}`)
      console.log(`Destination: ${result.destination_base_uri}`)
      console.log(
        `Entity reference updates: ${result.entity_reference_updates}`
      )
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`  Error: ${err}`)
        }
      }
    }

    if (!result.success) {
      exit_code = 1
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_validate(argv) {
  let exit_code = 0
  try {
    const result = await process_repositories_from_filesystem({
      include_path_patterns: argv['include-path-patterns'],
      exclude_path_patterns: argv['exclude-path-patterns']
    })

    const strict = argv.strict

    // In strict mode, promote warnings to errors
    if (strict) {
      for (const file of result.files) {
        if (Array.isArray(file.warnings) && file.warnings.length > 0) {
          file.errors = (file.errors || []).concat(file.warnings)
          file.warnings = []
        }
      }
    }

    // Count warnings and errors from files (accounts for strict promotion)
    let warning_count = 0
    let error_count = 0
    for (const file of result.files) {
      if (Array.isArray(file.warnings)) {
        warning_count += file.warnings.length
      }
      if (Array.isArray(file.errors) && file.errors.length > 0) {
        error_count++
      }
    }

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Total: ${result.total}`)
      console.log(`Validated: ${result.processed}`)
      console.log(`Skipped: ${result.skipped}`)
      console.log(`Errors: ${error_count}`)
      console.log(`Warnings: ${warning_count}`)

      for (const file of result.files) {
        if (file.errors && file.errors.length > 0) {
          console.error(`\n${file.base_uri || file.absolute_path}`)
          for (const err of file.errors) {
            console.error(`  ${err}`)
          }
        }
      }

      for (const file of result.files) {
        if (Array.isArray(file.warnings) && file.warnings.length > 0) {
          console.warn(`\n${file.base_uri || file.absolute_path}`)
          for (const warning of file.warnings) {
            console.warn(`  ${warning}`)
          }
        }
      }
    }

    if (error_count > 0) {
      exit_code = 1
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function fetch_entity_threads_from_api(argv) {
  const params = new URLSearchParams()
  params.set('base_uri', argv.base_uri)
  if (argv['relation-type']) params.set('relation_type', argv['relation-type'])
  params.set('limit', String(argv.limit))
  params.set('offset', String(argv.offset))
  const data = await api_get('/api/entities/threads', params)
  return data.threads || data
}

async function handle_threads(argv) {
  let exit_code = 0
  try {
    const threads = await query(
      () => fetch_entity_threads_from_api(argv),
      async () => {
          return embedded_index_manager.find_threads_relating_to({
          base_uri: argv.base_uri,
          relation_type: argv['relation-type'] || null,
          limit: argv.limit,
          offset: argv.offset
        })
      }
    )

    output_results(threads, {
      json: argv.json,
      verbose: argv.verbose,
      formatter: (thread) =>
        format_entity_thread(thread, { verbose: argv.verbose }),
      empty_message: `No threads found for entity: ${argv.base_uri}`
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_visibility_set(argv) {
  let exit_code = 0
  try {
    const { pattern, value } = argv
    const dry_run = argv['dry-run']
    const user_base_directory = config.user_base_directory

    if (!validate_boolean(value)) {
      console.error(
        `Error: Invalid boolean value '${value}'. Use 'true' or 'false'.`
      )
      flush_and_exit(1)
      return
    }

    const public_read = parse_boolean(value)

    console.log(`Finding files matching pattern: ${pattern}`)
    console.log(`Setting public_read to: ${public_read}`)
    if (dry_run) {
      console.log('Running in dry-run mode (no changes will be made)')
    }
    console.log()

    const files = await find_matching_files(pattern, user_base_directory)

    if (files.length === 0) {
      if (argv.json) {
        console.log(
          JSON.stringify(
            { files: [], summary: { successful: 0, failed: 0, changed: 0 } },
            null,
            2
          )
        )
      } else {
        console.log(`No supported files found matching pattern: ${pattern}`)
      }
      flush_and_exit(0)
      return
    }

    console.log(`Found ${files.length} file(s) to process:`)
    files.forEach((file) => console.log(`   ${file}`))
    console.log()

    const results = []
    for (const file of files) {
      const result = await process_file(file, public_read, dry_run)
      results.push(result)

      const filename = path.basename(result.file_path)
      if (result.success) {
        const status = result.dry_run ? '[DRY RUN]' : 'SUCCESS'
        const change =
          result.old_value !== result.new_value
            ? `${result.old_value} -> ${result.new_value}`
            : `${result.new_value} (no change)`
        console.log(`${status} ${filename}: ${change}`)
      } else {
        console.log(`ERROR ${filename}: ${result.error}`)
      }
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length
    const changed = results.filter(
      (r) => r.success && r.old_value !== r.new_value
    ).length

    if (argv.json) {
      console.log(
        JSON.stringify(
          { results, summary: { successful, failed, changed } },
          null,
          2
        )
      )
    } else {
      console.log()
      console.log('Summary:')
      console.log(`   Successful: ${successful}`)
      console.log(`   Failed: ${failed}`)
      console.log(`   Changed: ${changed}`)

      if (dry_run && changed > 0) {
        console.log()
        console.log('Run without --dry-run to apply these changes')
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_visibility_get(argv) {
  let exit_code = 0
  try {
    const { pattern } = argv
    const user_base_directory = config.user_base_directory

    const files = await find_matching_files(pattern, user_base_directory)

    if (files.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log(`No supported files found matching pattern: ${pattern}`)
      }
      flush_and_exit(0)
      return
    }

    const results = []
    for (const file of files) {
      const result = await get_visibility(file)
      results.push(result)
    }

    if (argv.json) {
      console.log(JSON.stringify(results, null, 2))
    } else {
      for (const result of results) {
        if (result.success) {
          const filename = path.basename(result.file_path)
          const value =
            result.public_read === undefined ? 'undefined' : result.public_read
          console.log(`${filename}: public_read=${value}`)
        } else {
          const filename = path.basename(result.file_path)
          console.log(`ERROR ${filename}: ${result.error}`)
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_update(argv) {
  let exit_code = 0
  try {
    const { base_uri } = argv

    // Parse --properties JSON string
    let extra_properties = {}
    if (argv.properties) {
      try {
        extra_properties = JSON.parse(argv.properties)
      } catch {
        throw new Error(`Invalid JSON for --properties: ${argv.properties}`)
      }
    }

    if (extra_properties.type !== undefined) {
      console.error(
        'Warning: "type" in --properties is ignored; entity type cannot be changed via update'
      )
      delete extra_properties.type
    }

    // Parse --tags comma-separated string into array
    if (argv.tags) {
      const tag_list = argv.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          if (t.includes(':') || t.includes('/')) return t
          return `user:tag/${t}.md`
        })
      extra_properties.tags = tag_list
    }

    // Build properties: start with --properties, then overlay explicit flags
    const properties = { ...extra_properties }
    if (argv.status) properties.status = argv.status
    if (argv.priority) properties.priority = argv.priority

    if (argv['dry-run']) {
      console.log(`Dry run - would update ${base_uri}:`)
      for (const [key, value] of Object.entries(properties)) {
        console.log(
          `  ${key}: ${Array.isArray(value) ? JSON.stringify(value) : value}`
        )
      }
      flush_and_exit(0)
      return
    }

    const result = await query(
      async () => {
        return api_mutate('/api/tasks', 'PATCH', {
          base_uri,
          properties,
          no_sync: argv['no-sync'] || undefined
        })
      },
      async () => {
        const absolute_path = resolve_base_uri_from_registry(base_uri)
        const entity_result = await read_entity_from_filesystem({
          absolute_path
        })
        if (!entity_result.success) {
          throw new Error(entity_result.error || 'Entity not found')
        }
        const now = new Date().toISOString()
        const merged = {
          ...entity_result.entity_properties,
          ...properties,
          updated_at: now
        }

        // Auto-set timestamps for task status transitions
        if (
          entity_result.entity_properties.type === 'task' &&
          properties.status
        ) {
          if (
            (properties.status === 'Started' ||
              properties.status === 'In Progress') &&
            !merged.started_at
          ) {
            merged.started_at = now
          }
          if (
            (properties.status === 'Completed' ||
              properties.status === 'Abandoned') &&
            !merged.finished_at
          ) {
            merged.finished_at = now
          }
        }

        await write_entity_to_filesystem({
          absolute_path,
          entity_properties: merged,
          entity_type: entity_result.entity_properties.type,
          entity_content: entity_result.entity_content || ''
        })

        // Sync status/priority changes to GitHub project fields (best-effort)
        const github_sync_result =
          !argv['no-sync'] &&
          entity_result.entity_properties.type === 'task' &&
          (properties.status || properties.priority)
            ? await sync_task_to_github({
                entity_properties: merged,
                changed_fields: {
                  status: properties.status,
                  priority: properties.priority
                },
                previous_status: entity_result.entity_properties.status
              })
            : null

        return {
          success: true,
          base_uri,
          updated_properties: properties,
          github_sync_result
        }
      }
    )

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Updated ${base_uri}`)
      for (const [key, value] of Object.entries(properties)) {
        console.log(
          `  ${key}: ${Array.isArray(value) ? JSON.stringify(value) : value}`
        )
      }

      // Display GitHub sync result
      const sync = result.github_sync_result
      if (sync) {
        if (sync.pushed_fields?.length > 0) {
          console.log(`  github: pushed ${sync.pushed_fields.join(', ')}`)
        } else if (sync.skipped_reason) {
          console.log(`  github: skipped (${sync.skipped_reason})`)
        }
        if (sync.errors?.length > 0) {
          for (const err of sync.errors) {
            console.error(`  github error (${err.field}): ${err.message}`)
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_observe(argv) {
  let exit_code = 0
  try {
    const { base_uri, observation } = argv

    if (!/^\[.+?\]/.test(observation)) {
      console.warn(
        'Warning: observation should start with [category] (e.g. "[decision] Selected X over Y"). See sys:system/guideline/write-observations.md'
      )
    }

    if (observation.length > 200) {
      console.warn(
        'Warning: observation exceeds 200 characters -- consider moving detailed content to entity body. See sys:system/guideline/write-observations.md'
      )
    }

    const absolute_path = resolve_base_uri_from_registry(base_uri)
    const entity_result = await read_entity_from_filesystem({ absolute_path })
    if (!entity_result.success) {
      throw new Error(entity_result.error || 'Entity not found')
    }

    const props = entity_result.entity_properties
    const observations = Array.isArray(props.observations)
      ? [...props.observations]
      : []
    observations.push(observation)

    const merged = {
      ...props,
      observations,
      updated_at: new Date().toISOString()
    }

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: merged,
      entity_type: props.type,
      entity_content: entity_result.entity_content || ''
    })

    if (argv.json) {
      console.log(
        JSON.stringify({ success: true, base_uri, observation }, null, 2)
      )
    } else {
      console.log(`Added observation to ${base_uri}`)
      console.log(`  ${observation}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_tree(argv) {
  let exit_code = 0
  try {
    const { base_uri, depth } = argv
    const default_dependency_types = [
      'blocked_by',
      'blocks',
      'subtask_of',
      'has_subtask',
      'precedes',
      'succeeds'
    ]

    const relation_type_arg = argv.relationType || argv['relation-type']
    const allowed_types = relation_type_arg
      ? relation_type_arg.split(',').map((t) => t.trim())
      : default_dependency_types

    const status_filter = argv.status
      ? argv.status.split(',').map((s) => s.trim().toLowerCase())
      : null

    if (!base_uri && !argv.project) {
      console.error('Error: either base_uri or --project is required')
      flush_and_exit(1)
      return
    }

    const fetch_relations_direct = async (uri) => {
      const forward = await embedded_index_manager.find_related_entities({
        base_uri: uri,
        limit: 100,
        offset: 0
      })
      const reverse = await embedded_index_manager.find_entities_relating_to({
        base_uri: uri,
        limit: 100,
        offset: 0
      })
      return { forward, reverse }
    }

    const fetch_relations = async (uri) => {
      try {
        return await query(
          async () => {
            const params = new URLSearchParams({
              base_uri: uri,
              direction: 'both'
            })
            return api_get('/api/entities/relations', params)
          },
          () => fetch_relations_direct(uri)
        )
      } catch {
        return await fetch_relations_direct(uri)
      }
    }

    const visited = new Set()
    const build_tree = async (uri, current_depth) => {
      if (current_depth > depth || visited.has(uri)) return null
      visited.add(uri)

      const result = await fetch_relations(uri)
      const children = []

      for (const rel of result.forward || []) {
        if (!allowed_types.includes(rel.relation_type)) continue
        const child = await build_tree(rel.base_uri, current_depth + 1)
        children.push({
          direction: '->',
          relation_type: rel.relation_type,
          base_uri: rel.base_uri,
          title: rel.title || '',
          status: rel.status || '',
          children: child ? child.children : []
        })
      }

      for (const rel of result.reverse || []) {
        if (!allowed_types.includes(rel.relation_type)) continue
        if (rel.base_uri && rel.base_uri.startsWith('user:thread/')) continue
        const child = await build_tree(rel.base_uri, current_depth + 1)
        children.push({
          direction: '<-',
          relation_type: rel.relation_type,
          base_uri: rel.base_uri,
          title: rel.title || '',
          status: rel.status || '',
          children: child ? child.children : []
        })
      }

      return { base_uri: uri, children }
    }

    const prune_tree = (node) => {
      if (!status_filter) return node
      const pruned_children = []
      for (const child of node.children) {
        const pruned_child = prune_tree(child)
        const status_matches =
          child.status && status_filter.includes(child.status.toLowerCase())
        if (status_matches || pruned_child.children.length > 0) {
          pruned_children.push({ ...child, children: pruned_child.children })
        }
      }
      return { ...node, children: pruned_children }
    }

    const fetch_project_entities = async (tag_uri) => {
      const direct_fallback = async () => {
          const entities = await embedded_index_manager.query_entities({
          filters: [{ column_id: 'tags', operator: 'IN', value: [tag_uri] }],
          limit: 1000,
          offset: 0
        })
        return entities.map((e) => e.base_uri)
      }

      try {
        return await query(async () => {
          const params = new URLSearchParams({ tags: tag_uri })
          const data = await api_get('/api/entities', params)
          return (data.entities || data).map((e) => e.base_uri)
        }, direct_fallback)
      } catch {
        return await direct_fallback()
      }
    }

    const print_node = (node, indent = '') => {
      for (const child of node.children) {
        const status_indicator = child.status ? ` [${child.status}]` : ''
        const title_part = child.title ? ` ${child.title}` : ''
        console.log(
          `${indent}${child.direction} ${child.relation_type}: ${child.base_uri}${title_part}${status_indicator}`
        )
        if (child.children.length > 0) {
          print_node({ children: child.children }, indent + '  ')
        }
      }
    }

    if (argv.project) {
      const entity_uris = await fetch_project_entities(argv.project)
      if (entity_uris.length === 0) {
        console.log(`No entities found with tag: ${argv.project}`)
        flush_and_exit(0)
        return
      }

      const trees = []
      for (const uri of entity_uris) {
        const tree = await build_tree(uri, 0)
        if (tree) trees.push(prune_tree(tree))
      }

      if (argv.json) {
        console.log(JSON.stringify(trees, null, 2))
      } else {
        for (const tree of trees) {
          console.log(tree.base_uri)
          if (tree.children.length > 0) {
            print_node(tree)
          } else {
            console.log('  (no dependency relations)')
          }
          console.log()
        }
      }
    } else {
      const tree = await build_tree(base_uri, 0)
      const pruned = prune_tree(tree)

      if (argv.json) {
        console.log(JSON.stringify(pruned, null, 2))
      } else {
        console.log(base_uri)
        if (pruned && pruned.children.length > 0) {
          print_node(pruned)
        } else {
          console.log('  (no dependency relations)')
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_share(argv) {
  let exit_code = 0
  try {
    const { base_uri } = argv
    const private_key_hex = argv['private-key'] || process.env.USER_PRIVATE_KEY

    if (!private_key_hex) {
      console.error(
        'Error: Private key required. Use --private-key or set USER_PRIVATE_KEY env var'
      )
      flush_and_exit(1)
      return
    }

    // Resolve entity to get entity_id
    let absolute_path
    try {
      absolute_path = resolve_base_uri_from_registry(base_uri)
    } catch {
      console.error(`Error: Could not resolve base URI: ${base_uri}`)
      flush_and_exit(1)
      return
    }

    const entity = await read_entity_from_filesystem({ absolute_path })
    if (!entity?.success || !entity.entity_properties?.entity_id) {
      console.error(`Error: Entity not found or missing entity_id: ${base_uri}`)
      flush_and_exit(1)
      return
    }

    // Parse expiration: duration string (7d, 24h) or ISO 8601 timestamp
    let exp = 0
    if (argv.expires) {
      const ms = parse_time_period_ms(argv.expires)
      if (ms !== null) {
        exp = Math.floor((Date.now() + ms) / 1000)
      } else {
        const parsed_date = new Date(argv.expires)
        if (Number.isNaN(parsed_date.getTime())) {
          console.error(
            `Error: Invalid expiration "${argv.expires}". Use duration (7d, 24h, 2w, 1m) or ISO 8601 timestamp (2026-04-15T00:00:00Z)`
          )
          flush_and_exit(1)
          return
        }
        const epoch_seconds = Math.floor(parsed_date.getTime() / 1000)
        if (epoch_seconds <= Math.floor(Date.now() / 1000)) {
          console.error(
            `Error: Expiration timestamp "${argv.expires}" is in the past`
          )
          flush_and_exit(1)
          return
        }
        exp = epoch_seconds
      }
    }

    const entity_id = entity.entity_properties.entity_id
    const token = create_share_token({
      entity_id,
      private_key: private_key_hex,
      public_key: config.user_public_key,
      exp
    })

    const base_url = config.public_url || SERVER_URL
    const share_url = `${base_url}/s/${token}`

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            share_url,
            token,
            entity_id,
            base_uri,
            expires_at: exp || null
          },
          null,
          2
        )
      )
    } else {
      console.log(share_url)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_references(argv) {
  let exit_code = 0
  try {
    const { base_uri } = argv
    if (!base_uri) {
      throw new Error('base_uri is required')
    }
    await embedded_index_manager.initialize()

    const [relations, tags, content_wikilinks, thread_refs, aliases] =
      await Promise.all([
        execute_sqlite_query({
          query: `SELECT source_base_uri, relation_type, context
                  FROM entity_relations WHERE target_base_uri = ?`,
          parameters: [base_uri]
        }),
        execute_sqlite_query({
          query: `SELECT entity_base_uri FROM entity_tags WHERE tag_base_uri = ?`,
          parameters: [base_uri]
        }),
        execute_sqlite_query({
          query: `SELECT source_base_uri FROM entity_content_wikilinks
                  WHERE target_base_uri = ?`,
          parameters: [base_uri]
        }),
        execute_sqlite_query({
          query: `SELECT thread_id, location FROM thread_references
                  WHERE target_base_uri = ?`,
          parameters: [base_uri]
        }),
        execute_sqlite_query({
          query: `SELECT alias_base_uri, current_base_uri FROM entity_aliases
                  WHERE current_base_uri = ?`,
          parameters: [base_uri]
        })
      ])

    const rows = [
      ...relations.map((r) => ({
        source: r.source_base_uri,
        source_kind: 'relation',
        relation_type: r.relation_type || null,
        context: r.context || null,
        location: null
      })),
      ...tags.map((r) => ({
        source: r.entity_base_uri,
        source_kind: 'tag',
        relation_type: null,
        context: null,
        location: null
      })),
      ...content_wikilinks.map((r) => ({
        source: r.source_base_uri,
        source_kind: 'content-wikilink',
        relation_type: null,
        context: null,
        location: null
      })),
      ...thread_refs.map((r) => ({
        source: `user:thread/${r.thread_id}`,
        source_kind: 'thread-metadata',
        relation_type: null,
        context: null,
        location: r.location || null
      })),
      ...aliases.map((r) => ({
        source: r.alias_base_uri,
        source_kind: 'alias',
        relation_type: null,
        context: null,
        location: null
      }))
    ]

    if (argv.json) {
      console.log(JSON.stringify(rows, null, 2))
    } else {
      const groups = {
        relation: [],
        tag: [],
        'content-wikilink': [],
        'thread-metadata': [],
        alias: []
      }
      for (const row of rows) groups[row.source_kind].push(row)

      const order = [
        'relation',
        'tag',
        'content-wikilink',
        'thread-metadata',
        'alias'
      ]
      let total = 0
      for (const kind of order) {
        const group_rows = groups[kind]
        if (group_rows.length === 0) continue
        total += group_rows.length
        console.log(`${kind} (${group_rows.length})`)
        for (const row of group_rows) {
          const detail = [
            row.relation_type ? `type=${row.relation_type}` : null,
            row.location ? `location=${row.location}` : null
          ]
            .filter(Boolean)
            .join(' ')
          console.log(`  ${row.source}${detail ? `  ${detail}` : ''}`)
        }
      }
      if (total === 0) {
        console.log(`No inbound references for ${base_uri}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_validate_references(argv) {
  let exit_code = 0
  try {
    await embedded_index_manager.initialize()

    const dangling_sql = `
      WITH known_uris AS (
        SELECT base_uri AS uri FROM entities
        UNION SELECT alias_base_uri AS uri FROM entity_aliases
      ),
      link_sources AS (
        SELECT 'relation' AS source_kind, source_base_uri AS source, target_base_uri AS target, relation_type AS detail
        FROM entity_relations
        UNION ALL
        SELECT 'tag' AS source_kind, entity_base_uri AS source, tag_base_uri AS target, NULL AS detail
        FROM entity_tags
        UNION ALL
        SELECT 'content-wikilink' AS source_kind, source_base_uri AS source, target_base_uri AS target, NULL AS detail
        FROM entity_content_wikilinks
        UNION ALL
        SELECT 'thread-metadata' AS source_kind, 'user:thread/' || thread_id AS source, target_base_uri AS target, location AS detail
        FROM thread_references
      )
      SELECT source_kind, source, target, detail
      FROM link_sources
      WHERE target NOT IN (SELECT uri FROM known_uris)
      ORDER BY source_kind, source
    `

    const dangling = await execute_sqlite_query({ query: dangling_sql })

    if (argv.json) {
      console.log(JSON.stringify(dangling, null, 2))
    } else if (dangling.length === 0) {
      console.log('No dangling references.')
    } else {
      console.log(`Dangling references: ${dangling.length}`)
      let current_kind = null
      for (const row of dangling) {
        if (row.source_kind !== current_kind) {
          current_kind = row.source_kind
          console.log(`\n${current_kind}`)
        }
        const detail = row.detail ? `  (${row.detail})` : ''
        console.log(`  ${row.source} -> ${row.target}${detail}`)
      }
    }

    if (dangling.length > 0) exit_code = 1
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
