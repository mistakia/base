#!/usr/bin/env node

/**
 * Explore Cursor SQLite Databases
 *
 * Script to find and analyze Cursor's chat conversation data in SQLite databases
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const log = debug('explore-cursor-sqlite')
debug.enable('explore-cursor-sqlite')

const CURSOR_BASE_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor')
const CURSOR_USER_PATH = path.join(CURSOR_BASE_PATH, 'User')
const CURSOR_WORKSPACE_PATH = path.join(CURSOR_USER_PATH, 'workspaceStorage')
const CURSOR_GLOBAL_DB = path.join(CURSOR_USER_PATH, 'globalStorage', 'state.vscdb')

async function exploreCursorSQLite() {
  try {
    log('=== Exploring Cursor SQLite Databases ===')

    // 1. Explore global state database more thoroughly
    log('\n--- Global State Database ---')
    const globalDb = await open({
      filename: CURSOR_GLOBAL_DB,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    })

    // Get all tables
    const tables = await globalDb.all("SELECT name FROM sqlite_master WHERE type='table'")
    log(`Tables: ${tables.map(t => t.name).join(', ')}`)

    // Check cursorDiskKV table
    const cursorKVCount = await globalDb.get('SELECT COUNT(*) as count FROM cursorDiskKV')
    log(`cursorDiskKV rows: ${cursorKVCount.count}`)

    if (cursorKVCount.count > 0) {
      const cursorKeys = await globalDb.all('SELECT key, length(value) as size FROM cursorDiskKV ORDER BY size DESC LIMIT 20')
      log('Top cursorDiskKV keys:')
      for (const row of cursorKeys) {
        log(`  ${row.key}: ${row.size} bytes`)
      }
    }

    // Look for composer chat data
    const composerKeys = await globalDb.all(`
      SELECT key, length(value) as size 
      FROM ItemTable 
      WHERE key LIKE '%composer%' 
      ORDER BY size DESC
      LIMIT 10
    `)

    log('\nComposer-related keys:')
    for (const row of composerKeys) {
      log(`  ${row.key}: ${row.size} bytes`)

      // Try to extract a sample
      if (row.size < 10000) {
        const data = await globalDb.get('SELECT value FROM ItemTable WHERE key = ?', row.key)
        try {
          // Try to convert blob to string
          const strData = data.value.toString('utf-8')
          log(`    Preview: ${strData.substring(0, 200)}...`)
        } catch (e) {
          log('    (Binary data)')
        }
      }
    }

    await globalDb.close()

    // 2. Check workspace-specific databases
    log('\n--- Workspace Databases ---')
    const workspaceDirs = await fs.readdir(CURSOR_WORKSPACE_PATH)

    // Sample a few workspace databases
    let sampledCount = 0
    for (const dir of workspaceDirs) {
      if (sampledCount >= 3) break

      const stateDbPath = path.join(CURSOR_WORKSPACE_PATH, dir, 'state.vscdb')
      try {
        await fs.access(stateDbPath)

        const wsDb = await open({
          filename: stateDbPath,
          driver: sqlite3.Database,
          mode: sqlite3.OPEN_READONLY
        })

        // Get row count
        const itemCount = await wsDb.get('SELECT COUNT(*) as count FROM ItemTable')
        log(`\nWorkspace ${dir}:`)
        log(`  ItemTable rows: ${itemCount.count}`)

        // Look for chat/conversation data
        const chatKeys = await wsDb.all(`
          SELECT key, length(value) as size 
          FROM ItemTable 
          WHERE key LIKE '%chat%' 
             OR key LIKE '%conversation%' 
             OR key LIKE '%message%'
             OR key LIKE '%composer%'
          ORDER BY size DESC
          LIMIT 10
        `)

        if (chatKeys.length > 0) {
          log('  Chat-related keys:')
          for (const row of chatKeys) {
            log(`    ${row.key}: ${row.size} bytes`)
          }

          // Try to read a large composer pane entry
          const largeComposer = chatKeys.find(k => k.key.includes('composerChatViewPane') && k.size > 1000)
          if (largeComposer) {
            const data = await wsDb.get('SELECT value FROM ItemTable WHERE key = ?', largeComposer.key)
            try {
              const strData = data.value.toString('utf-8')
              const parsed = JSON.parse(strData)
              log(`    Sample structure: ${JSON.stringify(Object.keys(parsed), null, 2)}`)

              // Check for messages or conversation data
              if (parsed.messages || parsed.conversation || parsed.history) {
                log('    *** Found potential conversation data! ***')
                log(`    Keys: ${Object.keys(parsed).join(', ')}`)
              }
            } catch (e) {
              // Not JSON or parse error
            }
          }
        }

        await wsDb.close()
        sampledCount++
      } catch (e) {
        // Skip if no database
      }
    }

    // 3. Look for other potential storage locations
    log('\n--- Checking for other storage locations ---')

    // Check localStorage path
    const localStoragePath = path.join(CURSOR_BASE_PATH, 'Local Storage', 'leveldb')
    try {
      await fs.access(localStoragePath)
      log(`Found Local Storage at: ${localStoragePath}`)
      const localFiles = await fs.readdir(localStoragePath)
      log(`  Files: ${localFiles.slice(0, 5).join(', ')}...`)
    } catch (e) {
      log('No Local Storage found')
    }

    // Check Session Storage
    const sessionStoragePath = path.join(CURSOR_BASE_PATH, 'Session Storage')
    try {
      await fs.access(sessionStoragePath)
      const sessionFiles = await fs.readdir(sessionStoragePath)
      log(`Found Session Storage with ${sessionFiles.length} files`)
    } catch (e) {
      log('No Session Storage found')
    }

    log('\n=== Summary ===')
    log('Chat data might be stored in:')
    log('1. workbench.panel.composerChatViewPane.* entries in workspace state.vscdb files')
    log('2. These appear to be stored as JSON blobs in the ItemTable')
    log('3. The data is workspace-specific, not in the global database')
  } catch (error) {
    log('Error exploring Cursor SQLite:', error)
  }
}

// Run exploration
exploreCursorSQLite().catch(console.error)
