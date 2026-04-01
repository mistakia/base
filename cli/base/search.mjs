/**
 * Search subcommand
 *
 * Full-text search via HTTP API with fallback to entity list search.
 */

import { list_entities } from '../entity-list.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { format_entity, output_results, flush_and_exit } from './lib/format.mjs'
import { query, api_get } from './lib/data-access.mjs'

export const command = 'search <query>'
export const describe = 'Full-text search across entities'

export const builder = (yargs) =>
  yargs
    .positional('query', {
      describe: 'Search query',
      type: 'string'
    })
    .option('limit', {
      alias: 'l',
      describe: 'Max results',
      type: 'number',
      default: 20
    })
    .option('offset', {
      describe: 'Offset for pagination',
      type: 'number',
      default: 0
    })
    .option('type', {
      alias: 't',
      describe: 'Filter by entity type',
      type: 'array'
    })

export const handler = async (argv) => {
  let exit_code = 0
  try {
    const results = await query(
      async () => {
        const params = new URLSearchParams({
          q: argv.query,
          limit: String(argv.limit)
        })
        if (argv.offset) params.set('offset', String(argv.offset))
        if (argv.type && argv.type.length > 0) {
          for (const t of argv.type) {
            params.append('type', t)
          }
        }
        const data = await api_get('/api/search', params)
        return data.entities || data.results || data
      },
      async () =>
        list_entities({
          search: argv.query,
          types: argv.type,
          limit: argv.limit,
          offset: argv.offset
        })
    )

    if (Array.isArray(results)) {
      output_results(results, {
        json: argv.json,
        verbose: argv.verbose,
        formatter: (item) => format_entity(item, { verbose: argv.verbose }),
        empty_message: 'No results found'
      })
    } else if (argv.json) {
      console.log(JSON.stringify(results, null, 2))
    } else {
      console.log('No results found')
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}
