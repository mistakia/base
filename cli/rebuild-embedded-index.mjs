#!/usr/bin/env bun

/**
 * @fileoverview CLI script to rebuild the embedded database index
 *
 * This script drops and recreates the DuckDB schema,
 * then repopulates them with all threads and entities from the filesystem.
 *
 * Usage:
 *   yarn rebuild:index
 *   node cli/rebuild-embedded-index.mjs
 */

import debug from 'debug'

import is_main from '#libs-server/utils/is-main.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

const log = debug('cli:rebuild-index')

/**
 * Rebuild the embedded database index
 *
 * @returns {Promise<void>}
 */
export async function rebuild_embedded_index() {
  log('Starting embedded index rebuild')

  // Initialize the index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    throw new Error(
      'Embedded index manager failed to initialize. Check configuration.'
    )
  }

  // Drop and recreate schemas, then repopulate from filesystem
  log('Dropping and recreating schemas')
  await embedded_index_manager.reset_and_rebuild_index()

  log('Index rebuild complete')
}

// CLI entry point
if (is_main(import.meta.url)) {
  debug.enable('cli:rebuild-index,embedded-index*')

  const main = async () => {
    let exit_code = 0

    try {
      await rebuild_embedded_index()
      console.log('\nIndex rebuild complete')
    } catch (error) {
      console.error('Error rebuilding index:', error.message)
      exit_code = 1
    }

    // Shutdown the index manager
    await embedded_index_manager.shutdown()
    process.exit(exit_code)
  }

  main()
}

export default rebuild_embedded_index
