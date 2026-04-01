#!/usr/bin/env bun

/**
 * Generate System Content Manifest
 *
 * Scans the system/ directory and produces a manifest.json listing all files
 * with their paths and sizes. Used by `base update` to sync system content.
 *
 * Usage:
 *   bun scripts/generate-system-manifest.mjs                    # Output to stdout
 *   bun scripts/generate-system-manifest.mjs --output dist/system/manifest.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const SYSTEM_DIR = path.join(PROJECT_ROOT, 'system')

function scan_directory(dir, base_path = '') {
  const entries = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative_path = base_path ? `${base_path}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      entries.push(...scan_directory(path.join(dir, entry.name), relative_path))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = fs.statSync(path.join(dir, entry.name))
      entries.push({
        path: relative_path,
        size: stat.size
      })
    }
  }

  return entries
}

const files = scan_directory(SYSTEM_DIR)

const manifest = {
  generated_at: new Date().toISOString(),
  file_count: files.length,
  files
}

const args = process.argv.slice(2)
const output_index = args.indexOf('--output')

if (output_index !== -1 && args[output_index + 1]) {
  const output_path = args[output_index + 1]
  fs.mkdirSync(path.dirname(output_path), { recursive: true })
  fs.writeFileSync(output_path, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`System manifest written to ${output_path} (${files.length} files)`)
} else {
  console.log(JSON.stringify(manifest, null, 2))
}
