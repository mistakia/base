/**
 * Database subcommand group
 *
 * Provides CLI access to database entities and storage adapters.
 * Agents can discover, query, and manage database data.
 */

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  get_database_entity,
  list_database_entities
} from '#libs-server/database/index.mjs'
import { get_storage_adapter } from '#libs-server/database/storage-adapters/index.mjs'
import { output_results, flush_and_exit } from './lib/format.mjs'

export const command = 'database <command>'
export const describe = 'Database operations (list, info, query, insert, sync)'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'List all database entities',
      (yargs) =>
        yargs
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 100
          })
          .option('offset', {
            describe: 'Offset for pagination',
            type: 'number',
            default: 0
          }),
      handle_list
    )
    .command(
      'info <name>',
      'Show database schema and info',
      (yargs) =>
        yargs.positional('name', {
          describe: 'Database name or base_uri',
          type: 'string'
        }),
      handle_info
    )
    .command(
      'query <name>',
      'Query database records',
      (yargs) =>
        yargs
          .positional('name', {
            describe: 'Database name or base_uri',
            type: 'string'
          })
          .option('filter', {
            alias: 'f',
            describe: 'Filter expression (e.g., "field=value", "field~term")',
            type: 'array'
          })
          .option('sort', {
            alias: 's',
            describe: 'Sort field (prefix with - for descending)',
            type: 'string'
          })
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 100
          })
          .option('offset', {
            describe: 'Offset for pagination',
            type: 'number',
            default: 0
          })
          .option('count', {
            alias: 'c',
            describe: 'Return count only',
            type: 'boolean',
            default: false
          }),
      handle_query
    )
    .command(
      'insert <name>',
      'Insert record into database',
      (yargs) =>
        yargs
          .positional('name', {
            describe: 'Database name or base_uri',
            type: 'string'
          })
          .option('data', {
            alias: 'd',
            describe: 'JSON data to insert',
            type: 'string',
            demandOption: true
          }),
      handle_insert
    )
    .command(
      'sync <name>',
      'Sync table schema (create/update)',
      (yargs) =>
        yargs.positional('name', {
          describe: 'Database name or base_uri',
          type: 'string'
        }),
      handle_sync
    )
    .demandCommand(1, 'You must specify a subcommand')

/**
 * Ensure embedded index is initialized
 */
async function ensure_index() {
  if (!embedded_index_manager.initialized) {
    await embedded_index_manager.initialize()
  }
}

/**
 * Handle list command
 */
async function handle_list(argv) {
  try {
    await ensure_index()

    const databases = await list_database_entities({
      limit: argv.limit,
      offset: argv.offset
    })

    if (argv.json) {
      output_results(databases, { json: true })
    } else if (databases.length === 0) {
      console.log('No databases found')
    } else {
      console.log(`Found ${databases.length} database(s):\n`)
      for (const db of databases) {
        const backend = db.backend || 'duckdb'
        console.log(`  ${db.title || db.table_name}`)
        console.log(`    Table: ${db.table_name}`)
        console.log(`    Backend: ${backend}`)
        console.log(`    URI: ${db.base_uri}`)
        console.log()
      }
    }

    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Handle info command
 */
async function handle_info(argv) {
  try {
    await ensure_index()

    const database_entity = await get_database_entity({ name: argv.name })

    if (!database_entity) {
      console.error(`Database not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    if (argv.json) {
      output_results(database_entity, { json: true })
    } else {
      console.log(
        `Database: ${database_entity.title || database_entity.table_name}`
      )
      console.log(`Table: ${database_entity.table_name}`)
      console.log(`URI: ${database_entity.base_uri}`)
      console.log()

      const storage_config = database_entity.storage_config || {}
      console.log('Storage Config:')
      console.log(`  Backend: ${storage_config.backend || 'duckdb'}`)
      if (storage_config.path) console.log(`  Path: ${storage_config.path}`)
      if (storage_config.directory)
        console.log(`  Directory: ${storage_config.directory}`)
      if (storage_config.schema_name)
        console.log(`  Schema: ${storage_config.schema_name}`)
      console.log()

      const fields = database_entity.fields || []
      console.log(`Fields (${fields.length}):`)
      for (const field of fields) {
        const required = field.required ? ' [required]' : ''
        const primary = field.primary_key ? ' [primary key]' : ''
        console.log(`  ${field.name}: ${field.type}${required}${primary}`)
        if (field.enum) {
          console.log(`    Allowed: ${field.enum.join(', ')}`)
        }
      }

      if (database_entity.import_cli) {
        console.log()
        console.log(`Import CLI: ${database_entity.import_cli}`)
      }
      if (database_entity.import_schedule) {
        console.log(`Import Schedule: ${database_entity.import_schedule}`)
      }
    }

    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Handle query command
 */
async function handle_query(argv) {
  try {
    await ensure_index()

    const database_entity = await get_database_entity({ name: argv.name })

    if (!database_entity) {
      console.error(`Database not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    const adapter = await get_storage_adapter(database_entity)

    if (argv.count) {
      const count = await adapter.count(argv.filter)
      if (argv.json) {
        output_results({ count }, { json: true })
      } else {
        console.log(`Count: ${count}`)
      }
    } else {
      const records = await adapter.query({
        filter: argv.filter,
        sort: argv.sort,
        limit: argv.limit,
        offset: argv.offset
      })

      if (argv.json) {
        output_results(records, { json: true })
      } else if (records.length === 0) {
        console.log('No records found')
      } else {
        console.log(`Found ${records.length} record(s):\n`)
        for (const record of records) {
          console.log(JSON.stringify(record, null, 2))
          console.log()
        }
      }
    }

    await adapter.close()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Handle insert command
 */
async function handle_insert(argv) {
  try {
    await ensure_index()

    const database_entity = await get_database_entity({ name: argv.name })

    if (!database_entity) {
      console.error(`Database not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    let data
    try {
      data = JSON.parse(argv.data)
    } catch {
      console.error('Invalid JSON data')
      flush_and_exit(1)
      return
    }

    const adapter = await get_storage_adapter(database_entity)
    const result = await adapter.insert(data)

    if (argv.json) {
      output_results(result, { json: true })
    } else {
      console.log(`Inserted ${result.inserted} record(s)`)
    }

    await adapter.close()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Handle sync command
 */
async function handle_sync(argv) {
  try {
    await ensure_index()

    const database_entity = await get_database_entity({ name: argv.name })

    if (!database_entity) {
      console.error(`Database not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    const adapter = await get_storage_adapter(database_entity)
    await adapter.create_table()

    if (argv.json) {
      output_results(
        { synced: true, table: database_entity.table_name },
        { json: true }
      )
    } else {
      console.log(`Table synced: ${database_entity.table_name}`)
    }

    await adapter.close()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

export default {
  command,
  describe,
  builder
}
