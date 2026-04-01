#!/usr/bin/env bun

/**
 * DuckDB to SQLite Migration Script
 *
 * Migrates existing DuckDB database entity storage to SQLite.
 * Reads each database entity's DuckDB file and writes a corresponding SQLite file.
 *
 * Usage:
 *   bun cli/migrate-duckdb-to-sqlite.mjs                 # Migrate all databases
 *   bun cli/migrate-duckdb-to-sqlite.mjs --dry-run       # Preview without changes
 *   bun cli/migrate-duckdb-to-sqlite.mjs --entity <uri>  # Migrate single entity
 */

import fs from 'fs'
import path from 'path'
import { Database } from 'bun:sqlite'
import config from '#config'

const args = process.argv.slice(2)
const dry_run = args.includes('--dry-run')
const entity_index = args.indexOf('--entity')
const specific_entity = entity_index !== -1 ? args[entity_index + 1] : null

async function find_duckdb_entities() {
  const user_base = config.user_base_directory
  const database_dir = path.join(user_base, 'database')

  if (!fs.existsSync(database_dir)) {
    console.log('No database/ directory found in user-base')
    return []
  }

  const entities = []
  const files = fs.readdirSync(database_dir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const file_path = path.join(database_dir, file)
    const content = fs.readFileSync(file_path, 'utf8')

    // Parse frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) continue

    // Check if it's a DuckDB backend
    if (
      content.includes("backend: 'duckdb'") ||
      content.includes('backend: duckdb') ||
      content.includes("backend: 'duckdb'")
    ) {
      // Find the .db or .duckdb file
      const db_match = content.match(/database:\s*(.+)/)
      if (db_match) {
        const db_path = db_match[1].trim().replace(/['"]/g, '')
        entities.push({
          entity_file: file_path,
          base_uri: `user:database/${file}`,
          db_path: path.resolve(user_base, db_path)
        })
      }
    }
  }

  return entities
}

async function migrate_database(entity) {
  const { entity_file, base_uri, db_path } = entity

  if (!fs.existsSync(db_path)) {
    console.log(`  SKIP ${base_uri}: DuckDB file not found at ${db_path}`)
    return false
  }

  const sqlite_path = db_path.replace(/\.(duckdb|db)$/, '.sqlite')

  console.log(`  Migrating: ${base_uri}`)
  console.log(`    Source:  ${db_path}`)
  console.log(`    Target:  ${sqlite_path}`)

  if (dry_run) {
    // Get table info from DuckDB
    let duckdb
    try {
      duckdb = await import('duckdb')
    } catch {
      console.log('    DuckDB not installed -- cannot read source database')
      return false
    }

    return new Promise((resolve) => {
      const db = new duckdb.default.Database(
        db_path,
        { access_mode: 'READ_ONLY' },
        (err) => {
          if (err) {
            console.log(`    ERROR: ${err.message}`)
            resolve(false)
            return
          }

          const conn = db.connect()
          conn.all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
            (err, tables) => {
              if (err) {
                console.log(`    ERROR reading tables: ${err.message}`)
                db.close(() => resolve(false))
                return
              }

              for (const t of tables) {
                conn.all(
                  `SELECT COUNT(*) as cnt FROM "${t.table_name}"`,
                  (err, rows) => {
                    if (!err) {
                      console.log(
                        `    Table: ${t.table_name} (${rows[0]?.cnt || 0} rows)`
                      )
                    }
                  }
                )
              }

              // Close after a small delay to let queries finish
              setTimeout(() => {
                db.close(() => resolve(true))
              }, 500)
            }
          )
        }
      )
    })
  }

  // Actual migration
  let duckdb
  try {
    duckdb = await import('duckdb')
  } catch {
    console.log('    DuckDB not installed -- cannot read source database')
    return false
  }

  return new Promise((resolve) => {
    const duck_db = new duckdb.default.Database(
      db_path,
      { access_mode: 'READ_ONLY' },
      (err) => {
        if (err) {
          console.log(`    ERROR opening DuckDB: ${err.message}`)
          resolve(false)
          return
        }

        const duck_conn = duck_db.connect()

        // Get tables
        duck_conn.all(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
          async (err, tables) => {
            if (err) {
              console.log(`    ERROR reading tables: ${err.message}`)
              duck_db.close(() => resolve(false))
              return
            }

            // Create SQLite database
            const sqlite_db = new Database(sqlite_path)
            sqlite_db.exec('PRAGMA journal_mode=WAL')

            let total_rows = 0

            for (const t of tables) {
              const table_name = t.table_name

              // Get CREATE TABLE statement
              duck_conn.all(
                `SELECT sql FROM duckdb_tables() WHERE table_name = '${table_name}'`,
                (err, ddl_rows) => {
                  if (err || !ddl_rows[0]) return

                  // Adapt DDL for SQLite
                  let create_sql = ddl_rows[0].sql
                  create_sql = create_sql
                    .replace(/VARCHAR/g, 'TEXT')
                    .replace(/BIGINT/g, 'INTEGER')
                    .replace(/DOUBLE/g, 'REAL')
                    .replace(/BOOLEAN/g, 'INTEGER')
                    .replace(/TIMESTAMP/g, 'TEXT')
                    .replace(/JSON/g, 'TEXT')
                    .replace(/FLOAT\[\d+\]/g, 'BLOB')

                  try {
                    sqlite_db.exec(create_sql)
                  } catch (e) {
                    console.log(
                      `    WARN: Could not create table ${table_name}: ${e.message}`
                    )
                  }
                }
              )

              // Copy data
              duck_conn.all(
                `SELECT * FROM "${table_name}"`,
                (err, rows) => {
                  if (err || !rows || rows.length === 0) return

                  const columns = Object.keys(rows[0])
                  const placeholders = columns.map(() => '?').join(', ')
                  const col_names = columns.map((c) => `"${c}"`).join(', ')

                  const insert_stmt = sqlite_db.prepare(
                    `INSERT INTO "${table_name}" (${col_names}) VALUES (${placeholders})`
                  )

                  for (const row of rows) {
                    const values = columns.map((c) => {
                      const v = row[c]
                      if (v === null || v === undefined) return null
                      if (typeof v === 'boolean') return v ? 1 : 0
                      if (typeof v === 'object') return JSON.stringify(v)
                      return v
                    })
                    try {
                      insert_stmt.run(...values)
                    } catch (e) {
                      // Skip individual row errors
                    }
                  }

                  total_rows += rows.length
                  console.log(
                    `    Migrated: ${table_name} (${rows.length} rows)`
                  )
                }
              )
            }

            // Close after migration
            setTimeout(() => {
              sqlite_db.close()
              duck_db.close(() => {
                console.log(`    Total: ${total_rows} rows migrated`)

                // Update entity frontmatter
                if (fs.existsSync(entity_file)) {
                  let content = fs.readFileSync(entity_file, 'utf8')
                  content = content.replace(
                    /backend:\s*['"]?duckdb['"]?/,
                    "backend: 'sqlite'"
                  )
                  content = content.replace(
                    /\.duckdb/g,
                    '.sqlite'
                  )
                  content = content.replace(/\.db(['"\s])/g, '.sqlite$1')
                  fs.writeFileSync(entity_file, content)
                  console.log(`    Updated entity: ${entity_file}`)
                }

                resolve(true)
              })
            }, 1000)
          }
        )
      }
    )
  })
}

async function main() {
  console.log(
    dry_run
      ? 'DuckDB to SQLite Migration (dry run)\n'
      : 'DuckDB to SQLite Migration\n'
  )

  const entities = await find_duckdb_entities()

  if (specific_entity) {
    const filtered = entities.filter((e) => e.base_uri === specific_entity)
    if (filtered.length === 0) {
      console.log(`Entity not found: ${specific_entity}`)
      process.exit(1)
    }
    await migrate_database(filtered[0])
  } else {
    if (entities.length === 0) {
      console.log('No DuckDB database entities found to migrate.')
      return
    }

    console.log(`Found ${entities.length} DuckDB database entities\n`)

    let migrated = 0
    for (const entity of entities) {
      const success = await migrate_database(entity)
      if (success) migrated++
    }

    console.log(`\nMigrated ${migrated}/${entities.length} databases`)
  }
}

main().catch((err) => {
  console.error('Migration error:', err.message)
  process.exit(1)
})
