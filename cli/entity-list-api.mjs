#!/usr/bin/env node

/**
 * @fileoverview HTTP-based entity list CLI for use when server is running
 *
 * Agent-optimized CLI that queries entities via the Base server HTTP API.
 * Designed for token-efficient output with tab-separated defaults.
 *
 * Usage:
 *   node cli/entity-list-api.mjs [options]
 *
 * Examples:
 *   node cli/entity-list-api.mjs -t task
 *   node cli/entity-list-api.mjs -t task --status "In Progress"
 *   node cli/entity-list-api.mjs --base-uri "user:task/my-task.md"
 */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const SERVER_URL = 'http://localhost:8080'

function format_entity(entity, { verbose = false, fields } = {}) {
  const default_fields = ['base_uri', 'title', 'type', 'status']
  const output_fields = fields?.length > 0 ? fields : default_fields

  if (verbose) {
    const lines = [entity.base_uri]
    for (const field of output_fields) {
      if (field !== 'base_uri' && entity[field] !== undefined) {
        const value = Array.isArray(entity[field])
          ? entity[field].join(', ')
          : entity[field]
        lines.push(`  ${field}: ${value}`)
      }
    }
    return lines.join('\n')
  }

  return output_fields
    .map((f) => (entity[f] === undefined ? '' : String(entity[f])))
    .join('\t')
}

const argv = yargs(hideBin(process.argv))
  .scriptName('entity-list-api')
  .usage('Query entities via HTTP API.\n\nUsage: $0 [options]')
  .option('base-uri', { describe: 'Single entity by base_uri', type: 'string' })
  .option('entity-id', { describe: 'Single entity by UUID', type: 'string' })
  .option('type', { alias: 't', describe: 'Entity type(s)', type: 'array' })
  .option('status', { describe: 'Status filter', type: 'string' })
  .option('priority', { describe: 'Priority filter', type: 'string' })
  .option('tags', { describe: 'Tag base_uris', type: 'array' })
  .option('without-tags', {
    describe: 'Entities without tags',
    type: 'boolean',
    default: false
  })
  .option('archived', {
    describe: 'Include archived',
    type: 'boolean',
    default: false
  })
  .option('search', { alias: 's', describe: 'Title search', type: 'string' })
  .option('fields', { alias: 'f', describe: 'Output fields', type: 'array' })
  .option('limit', {
    alias: 'l',
    describe: 'Max results',
    type: 'number',
    default: 50
  })
  .option('offset', {
    describe: 'Pagination offset',
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
  .option('verbose', {
    alias: 'v',
    describe: 'Multi-line output',
    type: 'boolean',
    default: false
  })
  .option('json', { describe: 'JSON output', type: 'boolean', default: false })
  .example('$0 -t task', 'List all tasks')
  .example('$0 -t task --status "In Progress"', 'List in-progress tasks')
  .example('$0 --base-uri "user:task/my-task.md"', 'Get single entity')
  .strict()
  .help()
  .alias('help', 'h')
  .parseSync()

const main = async () => {
  const params = new URLSearchParams()

  if (argv['base-uri']) params.set('base_uri', argv['base-uri'])
  if (argv['entity-id']) params.set('entity_id', argv['entity-id'])
  if (argv.type) argv.type.forEach((t) => params.append('type', t))
  if (argv.status) params.set('status', argv.status)
  if (argv.priority) params.set('priority', argv.priority)
  if (argv.tags) argv.tags.forEach((t) => params.append('tags', t))
  if (argv['without-tags']) params.set('without_tags', 'true')
  if (argv.archived) params.set('archived', 'true')
  if (argv.search) params.set('search', argv.search)
  params.set('limit', String(argv.limit))
  params.set('offset', String(argv.offset))
  params.set('sort', argv.sort)
  params.set('sort_desc', String(!argv.asc))

  try {
    const response = await fetch(`${SERVER_URL}/api/entities?${params}`)
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText }))
      console.error(`Error: ${error.error || response.statusText}`)
      process.exit(1)
    }

    const data = await response.json()

    if (data.entities.length === 0) {
      if (!argv.json) console.log('No entities found')
      else console.log('[]')
    } else if (argv.json) {
      console.log(JSON.stringify(data.entities, null, 2))
    } else {
      for (const entity of data.entities) {
        console.log(
          format_entity(entity, { verbose: argv.verbose, fields: argv.fields })
        )
        if (
          argv.verbose &&
          data.entities.indexOf(entity) < data.entities.length - 1
        )
          console.log('')
      }
    }
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') {
      console.error('Error: Server not running. Start with: yarn start')
    } else {
      console.error(`Error: ${error.message}`)
    }
    process.exit(1)
  }
}

main()
