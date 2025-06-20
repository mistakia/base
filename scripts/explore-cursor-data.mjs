#!/usr/bin/env node

/**
 * Explore Cursor Data Script
 *
 * Script to understand Cursor's data storage structure for chat conversations
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const log = debug('explore-cursor')
debug.enable('explore-cursor')

const CURSOR_BASE_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor')
const CURSOR_USER_PATH = path.join(CURSOR_BASE_PATH, 'User')
const CURSOR_HISTORY_PATH = path.join(CURSOR_USER_PATH, 'History')
const CURSOR_WORKSPACE_PATH = path.join(CURSOR_USER_PATH, 'workspaceStorage')
const CURSOR_GLOBAL_DB = path.join(CURSOR_USER_PATH, 'globalStorage', 'state.vscdb')

async function exploreCursorData() {
  try {
    log('=== Exploring Cursor Data Structure ===')

    // 1. Check History directory
    log('\n--- Checking History Directory ---')
    const historyDirs = await fs.readdir(CURSOR_HISTORY_PATH)
    log(`Found ${historyDirs.length} history directories`)

    // Sample first 5 directories
    for (const dir of historyDirs.slice(0, 5)) {
      const dirPath = path.join(CURSOR_HISTORY_PATH, dir)
      const files = await fs.readdir(dirPath)
      const mdFiles = files.filter(f => f.endsWith('.md'))
      log(`  ${dir}: ${mdFiles.length} markdown files`)

      // Sample first markdown file
      if (mdFiles.length > 0) {
        const sampleFile = path.join(dirPath, mdFiles[0])
        const content = await fs.readFile(sampleFile, 'utf-8')
        const lines = content.split('\n').slice(0, 10)
        log(`    Sample from ${mdFiles[0]}:`)
        log(`    ${lines[0]}`) // First line (usually title)
      }
    }

    // 2. Check workspace storage
    log('\n--- Checking Workspace Storage ---')
    const workspaceDirs = await fs.readdir(CURSOR_WORKSPACE_PATH)
    log(`Found ${workspaceDirs.length} workspace directories`)

    // Sample workspace directories
    for (const dir of workspaceDirs.slice(0, 3)) {
      const workspaceJsonPath = path.join(CURSOR_WORKSPACE_PATH, dir, 'workspace.json')
      try {
        const workspaceData = await fs.readFile(workspaceJsonPath, 'utf-8')
        const workspace = JSON.parse(workspaceData)
        log(`  ${dir}: ${workspace.folder}`)
      } catch (e) {
        // Skip if no workspace.json
      }
    }

    // 3. Check global database
    log('\n--- Checking Global Database ---')
    const db = await open({
      filename: CURSOR_GLOBAL_DB,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    })

    // Check for chat-related keys
    const chatKeys = await db.all(`
      SELECT key, length(value) as size 
      FROM ItemTable 
      WHERE key LIKE '%chat%' 
         OR key LIKE '%conversation%' 
         OR key LIKE '%message%'
         OR key LIKE '%history%'
      ORDER BY size DESC
      LIMIT 20
    `)

    log('Chat-related keys in database:')
    for (const row of chatKeys) {
      log(`  ${row.key}: ${row.size} bytes`)
    }

    await db.close()

    // 4. Analyze a sample history file structure
    log('\n--- Analyzing History File Structure ---')
    const sampleHistoryDir = historyDirs[0]
    const sampleDirPath = path.join(CURSOR_HISTORY_PATH, sampleHistoryDir)
    const sampleFiles = await fs.readdir(sampleDirPath)

    if (sampleFiles.length > 0) {
      const sampleFilePath = path.join(sampleDirPath, sampleFiles[0])
      const content = await fs.readFile(sampleFilePath, 'utf-8')

      // Try to identify structure
      const hasCodeBlocks = content.includes('```')
      const hasUserPrompts = content.includes('User:') || content.includes('Human:')
      const hasAssistantResponses = content.includes('Assistant:') || content.includes('AI:')

      log(`Sample file analysis for ${sampleFiles[0]}:`)
      log(`  Length: ${content.length} characters`)
      log(`  Lines: ${content.split('\n').length}`)
      log(`  Has code blocks: ${hasCodeBlocks}`)
      log(`  Has user prompts: ${hasUserPrompts}`)
      log(`  Has assistant responses: ${hasAssistantResponses}`)
    }

    log('\n=== Summary ===')
    log('Cursor appears to store chat history as:')
    log('1. Markdown files in History/<hash>/ directories')
    log('2. Each directory likely represents a workspace or project')
    log('3. Each .md file appears to be a separate conversation or session')
    log('4. Global state database contains metadata but not chat content')
  } catch (error) {
    log('Error exploring Cursor data:', error)
  }
}

// Run exploration
exploreCursorData().catch(console.error)
