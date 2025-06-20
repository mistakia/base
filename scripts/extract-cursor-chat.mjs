#!/usr/bin/env node

/**
 * Extract Cursor Chat Data
 *
 * Script to extract and analyze Cursor chat conversation data from SQLite
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const log = debug('extract-cursor-chat')
debug.enable('extract-cursor-chat')

const CURSOR_GLOBAL_DB = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')

async function extractCursorChats() {
  try {
    log('=== Extracting Cursor Chat Data ===')

    const db = await open({
      filename: CURSOR_GLOBAL_DB,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    })

    // Get all composerData entries
    const composerDataRows = await db.all(`
      SELECT key, length(value) as size 
      FROM cursorDiskKV 
      WHERE key LIKE 'composerData:%'
      ORDER BY size DESC
      LIMIT 10
    `)

    log(`Found ${composerDataRows.length} composer data entries`)

    // Extract and analyze first few entries
    for (let i = 0; i < Math.min(3, composerDataRows.length); i++) {
      const row = composerDataRows[i]
      log(`\n--- Analyzing ${row.key} (${(row.size / 1024 / 1024).toFixed(2)} MB) ---`)

      try {
        // Get the data
        const dataRow = await db.get('SELECT value FROM cursorDiskKV WHERE key = ?', row.key)
        const jsonStr = dataRow.value.toString('utf-8')
        const data = JSON.parse(jsonStr)

        // Analyze structure
        log(`Top-level keys: ${Object.keys(data).join(', ')}`)

        // Check for conversations/threads
        if (data.conversations) {
          log(`Conversations: ${Object.keys(data.conversations).length}`)

          // Sample first conversation
          const convIds = Object.keys(data.conversations)
          if (convIds.length > 0) {
            const firstConvId = convIds[0]
            const conv = data.conversations[firstConvId]

            log(`\nSample conversation ${firstConvId}:`)
            log(`  Type: ${conv.type || 'unknown'}`)

            if (conv.messages && Array.isArray(conv.messages)) {
              log(`  Messages: ${conv.messages.length}`)

              // Sample first few messages
              for (let j = 0; j < Math.min(3, conv.messages.length); j++) {
                const msg = conv.messages[j]
                log(`\n  Message ${j + 1}:`)
                log(`    Role: ${msg.role || msg.author || 'unknown'}`)
                log(`    Type: ${msg.type || 'text'}`)

                if (msg.content) {
                  if (typeof msg.content === 'string') {
                    log(`    Content: ${msg.content.substring(0, 100)}...`)
                  } else if (Array.isArray(msg.content)) {
                    log(`    Content parts: ${msg.content.length}`)
                    if (msg.content[0] && msg.content[0].text) {
                      log(`    First part: ${msg.content[0].text.substring(0, 100)}...`)
                    }
                  } else if (msg.content.text) {
                    log(`    Content: ${msg.content.text.substring(0, 100)}...`)
                  }
                }

                if (msg.timestamp || msg.createdAt) {
                  log(`    Timestamp: ${msg.timestamp || msg.createdAt}`)
                }
              }
            }

            // Check other conversation properties
            if (conv.metadata) {
              log(`\n  Metadata keys: ${Object.keys(conv.metadata).join(', ')}`)
            }
          }
        }

        // Check for other potential chat structures
        if (data.threads) {
          log(`\nThreads: ${Object.keys(data.threads).length}`)
        }

        if (data.messages) {
          log(`\nMessages array: ${data.messages.length} messages`)
        }

        // Save a sample for further analysis
        const samplePath = `./cursor-sample-${i + 1}.json`
        const sample = {
          key: row.key,
          size: row.size,
          structure: Object.keys(data),
          conversationCount: data.conversations ? Object.keys(data.conversations).length : 0,
          sampleConversation: data.conversations ? Object.values(data.conversations)[0] : null
        }

        await fs.writeFile(samplePath, JSON.stringify(sample, null, 2))
        log(`\nSaved sample to ${samplePath}`)
      } catch (error) {
        log(`Error processing ${row.key}: ${error.message}`)
      }
    }

    await db.close()

    log('\n=== Summary ===')
    log('Cursor chat data structure:')
    log('1. Stored in cursorDiskKV table with keys like composerData:{uuid}')
    log('2. Each entry contains JSON with conversations object')
    log('3. Each conversation has messages array with role, content, timestamp')
    log('4. Content can be string or array of content parts')
  } catch (error) {
    log('Error extracting Cursor chats:', error)
  }
}

// Run extraction
extractCursorChats().catch(console.error)
