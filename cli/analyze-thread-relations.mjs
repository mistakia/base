#!/usr/bin/env node

/**
 * CLI tool for analyzing thread relations
 *
 * Extracts entity references from thread timeline and discovers
 * related threads using LLM classification.
 *
 * Usage:
 *   node cli/analyze-thread-relations.mjs --thread-id <uuid>
 *   node cli/analyze-thread-relations.mjs --thread-id <uuid> --dry-run
 *   node cli/analyze-thread-relations.mjs --thread-id <uuid> --skip-related-threads
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import {
  analyze_thread_relations,
  SUPPORTED_MODELS
} from '#libs-server/metadata/analyze-thread-relations.mjs'

const log = debug('cli:analyze-thread-relations')

// Enable debug output
debug.enable('metadata:*,cli:*')

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .default('user_base_directory', config.user_base_directory)
  .scriptName('analyze-thread-relations')
  .usage(
    'Analyze thread relations.\n\n' +
      'Extracts entity references from timeline and discovers related threads.\n\n' +
      'Usage: $0 --thread-id <uuid> [options]'
  )
  .option('thread-id', {
    alias: 't',
    describe: 'Thread ID to analyze',
    type: 'string',
    demandOption: true
  })
  .option('dry-run', {
    alias: 'd',
    describe: 'Preview changes without updating metadata',
    type: 'boolean',
    default: false
  })
  .option('skip-related-threads', {
    alias: 's',
    describe: 'Skip LLM-based related thread discovery',
    type: 'boolean',
    default: false
  })
  .option('model', {
    alias: 'm',
    describe: `Model to use for LLM classification. Available: ${Object.keys(SUPPORTED_MODELS).join(', ')}`,
    type: 'string'
  })
  .option('json-output', {
    alias: 'j',
    describe:
      'Request structured JSON output from LLM (includes confidence scores)',
    type: 'boolean',
    default: false
  })
  .option('list-models', {
    describe: 'List available models and exit',
    type: 'boolean',
    default: false
  })
  .option('force', {
    alias: 'f',
    describe: 'Force re-analysis even if thread was previously analyzed',
    type: 'boolean',
    default: false
  })
  .option('output-format', {
    alias: 'o',
    describe: 'Output format',
    type: 'string',
    choices: ['text', 'json'],
    default: 'text'
  })
  .example('$0 --thread-id abc123', 'Analyze relations for thread abc123')
  .example('$0 --thread-id abc123 --dry-run', 'Preview without updating')
  .example(
    '$0 --thread-id abc123 --skip-related-threads',
    'Skip LLM thread discovery'
  )
  .example(
    '$0 --thread-id abc123 --model qwen-coder --json-output',
    'Use Qwen model with JSON output'
  )
  .example('$0 --list-models', 'List available models')
  .example(
    '$0 --thread-id abc123 --force',
    'Force re-analysis of already analyzed thread'
  )
  .strict()
  .help()
  .alias('help', 'h').argv

const main = async () => {
  // Handle --list-models
  if (argv.listModels) {
    console.log('\nAvailable models for thread relation analysis:\n')
    for (const [alias, full_id] of Object.entries(SUPPORTED_MODELS)) {
      console.log(`  ${alias.padEnd(20)} -> ${full_id}`)
    }
    console.log('\nUsage: --model <alias> or --model <full-model-id>')
    process.exit(0)
  }

  handle_cli_directory_registration(argv)

  let error
  try {
    log(`Analyzing relations for thread: ${argv.threadId}`)

    const result = await analyze_thread_relations({
      thread_id: argv.threadId,
      dry_run: argv.dryRun,
      skip_related_threads: argv.skipRelatedThreads,
      model: argv.model,
      use_json_output: argv.jsonOutput,
      force: argv.force
    })

    if (argv.outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('\n=== Thread Relation Analysis ===\n')
      console.log(`Thread ID: ${result.thread_id}`)
      console.log(`Status: ${result.status}`)

      if (result.status === 'already_analyzed') {
        console.log(`Already analyzed at: ${result.relations_analyzed_at}`)
      } else if (result.status === 'success') {
        console.log(
          `\nEntity references found: ${result.entity_references_count}`
        )
        console.log(`Entity relations: ${result.entity_relations_count}`)
        console.log(`Thread relations: ${result.thread_relations_count}`)
        console.log(`Total relations: ${result.total_relations_count}`)

        if (result.model_used) {
          console.log(`\nModel used: ${result.model_used}`)
        }
        if (result.candidates_evaluated) {
          console.log(`Candidates evaluated: ${result.candidates_evaluated}`)
        }
        if (result.related_threads_duration_ms > 0) {
          console.log(
            `Related threads discovery took: ${result.related_threads_duration_ms}ms`
          )
        }

        if (result.reasoning) {
          console.log(`\nLLM reasoning: ${result.reasoning}`)
        }

        if (result.relations && result.relations.length > 0) {
          console.log('\nRelations:')
          for (const relation of result.relations) {
            // Check if we have confidence scores for this relation
            const thread_id_match = relation.match(/user:thread\/([a-f0-9-]+)/)
            const confidence =
              thread_id_match && result.confidence_scores
                ? result.confidence_scores[thread_id_match[1]]
                : null
            const confidence_str = confidence ? ` [${confidence}]` : ''
            console.log(`  - ${relation}${confidence_str}`)
          }
        }

        if (argv.dryRun) {
          console.log('\n[DRY RUN] No changes were made to metadata')
        } else if (result.metadata_updated) {
          console.log('\nMetadata updated successfully')
        }
      }
    }
  } catch (err) {
    error = err
    if (argv.outputFormat === 'json') {
      console.log(JSON.stringify({ error: error.message }, null, 2))
    } else {
      console.error('Error:', error.message)
    }
  }

  process.exit(error ? 1 : 0)
}

main()
