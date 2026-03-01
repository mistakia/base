/**
 * Index subcommand group
 *
 * Scans distributed infrastructure to build a file and folder index.
 * Collectors: local (filesystem), ssh (remote), gdrive (Google Drive).
 */

import { get_database_entity } from '#libs-server/database/index.mjs'
import { get_storage_adapter } from '#libs-server/database/storage-adapters/index.mjs'
import { output_results, flush_and_exit } from './lib/format.mjs'

export const command = 'index <command>'
export const describe = 'File and folder index operations (scan, duplicates)'

export const builder = (yargs) =>
  yargs
    .command(
      'scan',
      'Scan a source to index files and folders',
      (yargs) =>
        yargs
          .option('source', {
            alias: 's',
            describe: 'Source to scan: local, ssh, gdrive',
            type: 'string',
            demandOption: true
          })
          .option('path', {
            alias: 'p',
            describe: 'Path to scan (source-specific)',
            type: 'string'
          })
          .option('host', {
            describe: 'SSH host (for ssh source)',
            type: 'string',
            default: 'storage'
          })
          .option('exclude', {
            alias: 'e',
            describe: 'Glob patterns to exclude',
            type: 'array',
            default: []
          })
          .option('dry-run', {
            describe: 'Show what would be indexed without writing',
            type: 'boolean',
            default: false
          })
          .option('max-depth', {
            describe: 'Maximum directory depth to scan',
            type: 'number'
          }),
      handle_scan
    )
    .command(
      'duplicates',
      'Find potential duplicate files by size',
      (yargs) =>
        yargs
          .option('source', {
            alias: 's',
            describe: 'Filter to one source',
            type: 'string'
          })
          .option('min-size', {
            describe: 'Minimum file size (e.g. 1KB, 1MB)',
            type: 'string',
            default: '1KB'
          })
          .option('limit', {
            alias: 'l',
            describe: 'Maximum number of duplicate groups',
            type: 'number',
            default: 50
          }),
      handle_duplicates
    )
    .command(
      'stats',
      'Show index statistics',
      (yargs) =>
        yargs.option('source', {
          alias: 's',
          describe: 'Filter by source',
          type: 'string'
        }),
      handle_stats
    )
    .demandCommand(1, 'You must specify a subcommand')

/**
 * Get the file_index database adapter
 */
async function get_file_index_adapter() {
  const entity = await get_database_entity({ name: 'file_index' })
  if (!entity) {
    throw new Error(
      'file_index database not found. Run: base database sync file_index'
    )
  }
  return get_storage_adapter(entity)
}

/**
 * Get the folders database adapter
 */
async function get_folders_adapter() {
  const entity = await get_database_entity({ name: 'folders' })
  if (!entity) {
    throw new Error(
      'folders database not found. Run: base database sync folders'
    )
  }
  return get_storage_adapter(entity)
}

/**
 * Handle scan command
 */
async function handle_scan(argv) {
  const { source } = argv

  try {
    let collector
    switch (source) {
      case 'local':
        collector = await import_local_collector()
        break
      case 'ssh':
        collector = await import_ssh_collector()
        break
      case 'gdrive':
        collector = await import_gdrive_collector()
        break
      case 'apple-notes':
        collector = await import_apple_notes_collector()
        break
      default:
        console.error(`Unknown source: ${source}`)
        console.error('Available sources: local, ssh, gdrive, apple-notes')
        flush_and_exit(1)
        return
    }

    const scan_options = {
      path: argv.path,
      host: argv.host,
      exclude: argv.exclude,
      dry_run: argv['dry-run'],
      max_depth: argv['max-depth']
    }

    console.log(`Scanning source: ${source}`)
    if (scan_options.path) {
      console.log(`Path: ${scan_options.path}`)
    }

    let { files, folders } = await collector.scan(scan_options)

    console.log(`Found ${files.length} files, ${folders.length} folders`)

    if (scan_options.dry_run) {
      if (argv.json) {
        output_results(
          { files: files.length, folders: folders.length },
          { json: true }
        )
      } else {
        console.log('\nDry run -- no records written')
        if (files.length > 0) {
          console.log('\nSample files (first 10):')
          for (const f of files.slice(0, 10)) {
            console.log(`  ${f.base_uri}  (${format_size(f.size)})`)
          }
        }
        if (folders.length > 0) {
          console.log('\nSample folders (first 10):')
          for (const f of folders.slice(0, 10)) {
            console.log(`  ${f.base_uri}  (${f.file_count} files)`)
          }
        }
      }
      flush_and_exit(0)
      return
    }

    // Write to databases
    const file_adapter = await get_file_index_adapter()
    const folder_adapter = await get_folders_adapter()

    // Clear existing records for this scan scope before inserting
    // Derive prefix from scan options (not data) to ensure full scope is cleared
    const uri_prefix = get_scan_uri_prefix(source, argv)
    await clear_records_by_prefix(file_adapter, 'file_index', uri_prefix)
    await clear_records_by_prefix(folder_adapter, 'folders', uri_prefix)

    // Deduplicate files by base_uri (Google Drive can return duplicates)
    if (files.length > 0) {
      const seen = new Set()
      const deduped = []
      for (const f of files) {
        if (!seen.has(f.base_uri)) {
          seen.add(f.base_uri)
          deduped.push(f)
        }
      }
      if (deduped.length < files.length) {
        console.log(`Deduplicated: ${files.length} -> ${deduped.length} files`)
        files = deduped
      }
    }

    // Batch insert files
    if (files.length > 0) {
      const batch_size = files.length > 10000 ? 5000 : 500
      const report_every = files.length > 50000 ? 50000 : 5000
      let inserted = 0
      for (let i = 0; i < files.length; i += batch_size) {
        const batch = files.slice(i, i + batch_size)
        await file_adapter.insert(batch)
        inserted += batch.length
        if (files.length > batch_size && inserted % report_every < batch_size) {
          process.stdout.write(
            `\rInserted ${inserted}/${files.length} files...`
          )
        }
      }
      if (files.length > batch_size) {
        process.stdout.write('\n')
      }
      console.log(`Indexed ${files.length} files`)
    }

    // Batch insert folders
    if (folders.length > 0) {
      const batch_size = folders.length > 10000 ? 5000 : 500
      for (let i = 0; i < folders.length; i += batch_size) {
        const batch = folders.slice(i, i + batch_size)
        await folder_adapter.insert(batch)
      }
      console.log(`Indexed ${folders.length} folders`)
    }

    await file_adapter.close()
    await folder_adapter.close()

    if (argv.json) {
      output_results(
        { source, files: files.length, folders: folders.length },
        { json: true }
      )
    }

    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Handle duplicates command
 */
async function handle_duplicates(argv) {
  try {
    const min_bytes = parse_size_string(argv['min-size'])
    const limit = argv.limit

    const file_adapter = await get_file_index_adapter()

    let where_clause = 'WHERE "size" > $1'
    const params = [min_bytes]

    if (argv.source) {
      where_clause += ' AND "source" = $2'
      params.push(argv.source)
    }

    const sql = `
      SELECT "size", COUNT(*) as count, array_agg("base_uri") as locations
      FROM "file_index"
      ${where_clause}
      GROUP BY "size"
      HAVING COUNT(*) > 1
      ORDER BY "size" DESC
      LIMIT $${params.length + 1}
    `
    params.push(limit)

    const results = await file_adapter.raw_query({ query: sql, parameters: params })
    await file_adapter.close()

    // Convert bigint values
    const groups = results.map((row) => ({
      size: typeof row.size === 'bigint' ? Number(row.size) : row.size,
      count: typeof row.count === 'bigint' ? Number(row.count) : row.count,
      locations: row.locations
    }))

    if (argv.json) {
      console.log(JSON.stringify(groups, null, 2))
      flush_and_exit(0)
      return
    }

    if (groups.length === 0) {
      console.log('No duplicate candidates found.')
      flush_and_exit(0)
      return
    }

    console.log(`Found ${groups.length} size-based duplicate groups:\n`)

    for (const group of groups) {
      console.log(`Size: ${format_size(group.size)} (${group.count} files)`)
      for (const uri of group.locations) {
        console.log(`  ${uri}`)
      }
      console.log('')
    }

    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Parse human-readable size string to bytes
 */
function parse_size_string(size_str) {
  if (typeof size_str === 'number') return size_str
  const match = String(size_str).match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i)
  if (!match) return 1024 // default 1KB
  const value = parseFloat(match[1])
  const unit = (match[2] || 'B').toUpperCase()
  const multipliers = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return Math.floor(value * (multipliers[unit] || 1))
}

/**
 * Handle stats command
 */
async function handle_stats(argv) {
  try {
    const file_adapter = await get_file_index_adapter()

    const sources = ['local', 'ssh', 'gdrive', 'apple-notes']
    const stats = []

    for (const source of sources) {
      if (argv.source && argv.source !== source) continue
      const count = await file_adapter.count([`source = ${source}`])
      if (count > 0) {
        stats.push({ source, file_count: count })
      }
    }

    const total = await file_adapter.count()
    await file_adapter.close()

    if (argv.json) {
      output_results({ total, sources: stats }, { json: true })
    } else if (stats.length === 0) {
      console.log(
        'No indexed files. Run: base index scan --source local --path /some/path'
      )
    } else {
      console.log(`Total indexed files: ${total}\n`)
      for (const s of stats) {
        console.log(`  ${s.source}: ${s.file_count} files`)
      }
    }

    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    flush_and_exit(1)
  }
}

/**
 * Clear existing records by base_uri prefix
 */
async function clear_records_by_prefix(adapter, table_name, uri_prefix) {
  const count = await adapter.count([`base_uri ~ ${uri_prefix}`])
  if (count > 0) {
    console.log(
      `Clearing ${count} existing records matching ${uri_prefix}* ...`
    )
    await adapter.execute({
      query: `DELETE FROM "${table_name}" WHERE "base_uri" LIKE $1`,
      parameters: [`${uri_prefix}%`]
    })
  }
}

/**
 * Build URI prefix from scan options for scoped clearing
 */
function get_scan_uri_prefix(source, argv) {
  const scan_path = argv.path
  switch (source) {
    case 'ssh': {
      const host = argv.host || 'storage'
      const trailing = scan_path?.endsWith('/') ? scan_path : scan_path + '/'
      return scan_path ? `ssh://${host}${trailing}` : `ssh://${host}/`
    }
    case 'local':
      return scan_path ? `file://${scan_path}` : 'file://'
    case 'gdrive':
      return scan_path ? `gdrive://${scan_path}` : 'gdrive://'
    case 'apple-notes':
      return 'apple-notes://'
    default:
      return get_uri_prefix_for_source(source)
  }
}

function get_uri_prefix_for_source(source) {
  switch (source) {
    case 'local':
      return 'file://'
    case 'ssh':
      return 'ssh://'
    case 'gdrive':
      return 'gdrive://'
    case 'apple-notes':
      return 'apple-notes://'
    default:
      return source + '://'
  }
}

function format_size(bytes) {
  if (bytes == null) return 'unknown'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

/**
 * Dynamic collector imports
 */
async function import_local_collector() {
  const { scan } = await import('#libs-server/index-collectors/local.mjs')
  return { scan }
}

async function import_ssh_collector() {
  const { scan } = await import('#libs-server/index-collectors/ssh.mjs')
  return { scan }
}

async function import_gdrive_collector() {
  const { scan } = await import('#libs-server/index-collectors/gdrive.mjs')
  return { scan }
}

async function import_apple_notes_collector() {
  const { scan } = await import('#libs-server/index-collectors/apple-notes.mjs')
  return { scan }
}

export default {
  command,
  describe,
  builder
}
