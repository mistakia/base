/**
 * Search subcommand.
 *
 * Source-first search via HTTP /api/search. No filesystem fallback; API
 * unavailability returns a distinct exit code so callers can distinguish
 * an unreachable server from "no matches".
 */

import { authenticated_fetch } from './lib/auth.mjs'
import { SERVER_URL, flush_and_exit } from './lib/format.mjs'

const EXIT_OK = 0
const EXIT_ERROR = 1
const EXIT_API_UNREACHABLE = 2

export const command = 'search <query>'
export const describe = 'Source-first search across entities and threads'

export const builder = (yargs) =>
  yargs
    .positional('query', {
      describe: 'Search query',
      type: 'string'
    })
    .option('source', {
      alias: 's',
      describe:
        'CSV of sources: entity,thread_metadata,thread_timeline,path,semantic',
      type: 'string'
    })
    .option('type', {
      alias: 't',
      describe: 'CSV of entity types (task,workflow,thread,...)',
      type: 'string'
    })
    .option('tag', {
      describe: 'CSV of tag base_uris',
      type: 'string'
    })
    .option('status', {
      describe: 'CSV of status values',
      type: 'string'
    })
    .option('path', {
      describe: 'Glob against entity_uri',
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

function is_api_unavailable(error) {
  return (
    error.cause?.code === 'ECONNREFUSED' ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('fetch failed') ||
    error.message.includes('Unable to connect')
  )
}

function build_params(argv) {
  const params = new URLSearchParams({ q: argv.query })
  if (argv.limit) params.set('limit', String(argv.limit))
  if (argv.offset) params.set('offset', String(argv.offset))
  if (argv.source) params.set('source', argv.source)
  if (argv.type) params.set('type', argv.type)
  if (argv.tag) params.set('tag', argv.tag)
  if (argv.status) params.set('status', argv.status)
  if (argv.path) params.set('path', argv.path)
  return params
}

function format_result(result, { verbose }) {
  if (verbose) {
    const lines = [result.entity_uri]
    if (result.title) lines.push(`  title: ${result.title}`)
    if (result.type) lines.push(`  type: ${result.type}`)
    if (result.score !== undefined) {
      lines.push(`  score: ${result.score.toFixed(3)}`)
    }
    if (result.updated_at) lines.push(`  updated_at: ${result.updated_at}`)
    if (Array.isArray(result.matches) && result.matches.length > 0) {
      lines.push('  matches:')
      for (const match of result.matches) {
        const snippet = match.snippet
          ? ` — ${match.snippet.replace(/\s+/g, ' ').slice(0, 80)}`
          : ''
        lines.push(`    - ${match.source}${snippet}`)
      }
    }
    return lines.join('\n')
  }
  const score = result.score !== undefined ? result.score.toFixed(3) : ''
  return [
    result.entity_uri,
    result.type || '',
    score,
    result.title || ''
  ].join('\t')
}

export const handler = async (argv) => {
  try {
    const params = build_params(argv)
    const url = `${SERVER_URL}/api/search?${params.toString()}`

    let response
    try {
      response = await authenticated_fetch(url)
    } catch (error) {
      if (is_api_unavailable(error)) {
        console.error(
          `Error: base-api is unreachable at ${SERVER_URL}. Offline search is not supported; start the API and retry.`
        )
        flush_and_exit(EXIT_API_UNREACHABLE)
        return
      }
      throw error
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const message =
        body.error ||
        body.message ||
        `API returned ${response.status} ${response.statusText}`
      console.error(`Error: ${message}`)
      flush_and_exit(EXIT_ERROR)
      return
    }

    const data = await response.json()
    const results = data.results || []

    if (argv.json) {
      console.log(JSON.stringify(data, null, 2))
    } else if (results.length === 0) {
      console.log('No results found')
    } else {
      for (let i = 0; i < results.length; i++) {
        console.log(format_result(results[i], { verbose: argv.verbose }))
        if (argv.verbose && i < results.length - 1) console.log('')
      }
    }

    flush_and_exit(EXIT_OK)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    flush_and_exit(EXIT_ERROR)
  }
}
