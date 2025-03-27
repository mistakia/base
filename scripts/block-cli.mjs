#!/usr/bin/env node

/**
 * Command-line interface for markdown block conversion and storage
 */

import dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import debug from 'debug'

import db from '#db'
import {
  import_file,
  export_file,
  search_blocks,
  show_block
} from '#libs-server/blocks/index.mjs'

// Load environment variables
dotenv.config()

const log = debug('block-cli')

// Default user ID (for testing purposes)
const DEFAULT_USER_ID =
  process.env.DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Format output based on format type
 */
function format_output(data, format) {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (!data.success) {
    console.error(`Error: ${data.error}`)
    return
  }

  switch (data.type) {
    case 'document': {
      log(`Document CID: ${data.document.document.block_cid}`)
      log(`Title: ${data.document.document.attributes.title || 'Untitled'}`)
      log(`Path: ${data.document.document.attributes.path || 'N/A'}`)
      log(`Blocks: ${Object.keys(data.document.blocks).length}`)

      // Show a breakdown of block types
      const block_types = {}
      for (const block of Object.values(data.document.blocks)) {
        block_types[block.type] = (block_types[block.type] || 0) + 1
      }

      log('\nBlock types:')
      for (const [type, count] of Object.entries(block_types)) {
        log(`  ${type}: ${count}`)
      }
      break
    }

    case 'block': {
      const block = data.block
      log(`Block CID: ${block.block_cid}`)
      log(`Type: ${block.type}`)
      log(`Created: ${block.metadata.created_at}`)
      log(`Updated: ${block.metadata.updated_at}`)

      if (block.content) {
        log('\nContent:')
        log(block.content)
      }

      if (Object.keys(block.attributes).length > 0) {
        log('\nAttributes:')
        for (const [key, value] of Object.entries(block.attributes)) {
          log(`  ${key}: ${JSON.stringify(value)}`)
        }
      }

      if (block.relationships.parent) {
        log(`\nParent: ${block.relationships.parent}`)
      }

      if (
        block.relationships.children &&
        block.relationships.children.length > 0
      ) {
        log(`\nChildren: ${block.relationships.children.length}`)
        for (const child of block.relationships.children) {
          log(`  ${child}`)
        }
      }
      break
    }

    default:
      // Handle import/export/search results
      if (data.markdown_file_root_block_cid) {
        log(`Imported ${data.file_path} successfully.`)
        log(`Document CID: ${data.markdown_file_root_block_cid}`)
      } else if (data.results) {
        log(`Found ${data.count} results for '${data.query}':`)
        for (const block of data.results) {
          log('\n----------------')
          log(`CID: ${block.block_cid}`)
          log(`Type: ${block.type}`)
          log(
            `Content: ${block.content.substring(0, 100)}${block.content.length > 100 ? '...' : ''}`
          )
        }
      } else if (data.file_path) {
        log(
          `Exported document ${data.block_cid} to ${data.file_path} successfully.`
        )
      }
  }
}

/**
 * Main function
 */
async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <command> [options]')
    .command(
      'import <file>',
      'Import a markdown file into the block store',
      (yargs) => {
        return yargs.positional('file', {
          describe: 'Path to the markdown file',
          type: 'string',
          demandOption: true
        })
      }
    )
    .command(
      'export <block_cid> <file>',
      'Export a document from the block store to a markdown file',
      (yargs) => {
        return yargs
          .positional('block_cid', {
            describe: 'Content ID of the document',
            type: 'string',
            demandOption: true
          })
          .positional('file', {
            describe: 'Path to save the markdown file',
            type: 'string',
            demandOption: true
          })
      }
    )
    .command('search <query>', 'Search for blocks by content', (yargs) => {
      return yargs
        .positional('query', {
          describe: 'Search query',
          type: 'string',
          demandOption: true
        })
        .option('type', {
          describe: 'Filter by block type',
          type: 'string'
        })
        .option('limit', {
          describe: 'Limit number of results',
          type: 'number',
          default: 10
        })
    })
    .command('show <block_cid>', 'Show block details by CID', (yargs) => {
      return yargs.positional('block_cid', {
        describe: 'Content ID of the block or document',
        type: 'string',
        demandOption: true
      })
    })
    .option('user-id', {
      alias: 'u',
      description: 'User ID for block ownership',
      type: 'string',
      default: DEFAULT_USER_ID
    })
    .option('format', {
      alias: 'f',
      description: 'Output format: json or text',
      type: 'string',
      choices: ['json', 'text'],
      default: 'text'
    })
    .help()
    .alias('help', 'h')
    .demandCommand(1, 'Please specify a command')
    .epilog('Markdown Block Conversion and Storage Tool').argv

  log('Configuration:', {
    command: argv._[0],
    user_id: argv.userId,
    format: argv.format
  })

  try {
    let result
    switch (argv._[0]) {
      case 'import':
        result = await import_file({
          file_path: argv.file,
          user_id: argv.userId
        })
        break

      case 'export':
        result = await export_file({
          block_cid: argv.block_cid,
          file_path: argv.file,
          user_id: argv.userId
        })
        break

      case 'search':
        result = await search_blocks({
          query: argv.query,
          type: argv.type,
          limit: argv.limit,
          user_id: argv.userId
        })
        break

      case 'show':
        result = await show_block({
          block_cid: argv.block_cid,
          user_id: argv.userId
        })
        break
    }

    format_output(result, argv.format)
  } finally {
    // Destroy the knex connection pool
    await db.destroy()
  }
}

// Run the CLI
main().catch((err) => {
  console.error('Unexpected error:', err)
  db.destroy()
  process.exit(1)
})
