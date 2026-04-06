#!/usr/bin/env bun

/**
 * Generate Installable Content Manifest
 *
 * Scans a content directory (extension, workflow, guideline, skill, hook)
 * and produces a manifest.json listing all files with paths and sizes.
 * Used by `base install` for directory-based content.
 *
 * Usage:
 *   bun scripts/generate-content-manifest.mjs <source-dir> <output-dir>
 *
 * Examples:
 *   bun scripts/generate-content-manifest.mjs ../user-base/extension/graph dist/content/extension/graph
 *   bun scripts/generate-content-manifest.mjs ../user-base/workflow dist/content/workflow
 */

import fs from 'fs'
import path from 'path'

function scan_directory(dir, base_path = '') {
  const entries = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip hidden files/directories and dist output directory
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'dist') continue

    const relative_path = base_path ? `${base_path}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      entries.push(...scan_directory(path.join(dir, entry.name), relative_path))
    } else if (entry.isFile()) {
      const stat = fs.statSync(path.join(dir, entry.name))
      entries.push({
        path: relative_path,
        size: stat.size
      })
    }
  }

  return entries
}

const args = process.argv.slice(2)

if (args.length < 2) {
  console.error('Usage: generate-content-manifest.mjs <source-dir> <output-dir>')
  process.exit(1)
}

const source_dir = path.resolve(args[0])
const output_dir = path.resolve(args[1])

if (!fs.existsSync(source_dir)) {
  console.error(`Source directory not found: ${source_dir}`)
  process.exit(1)
}

const files = scan_directory(source_dir)

const manifest = {
  name: path.basename(source_dir),
  generated_at: new Date().toISOString(),
  file_count: files.length,
  files
}

// Copy files to output directory
fs.mkdirSync(output_dir, { recursive: true })

for (const file of files) {
  const src = path.join(source_dir, file.path)
  const dest = path.join(output_dir, file.path)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

// Write manifest
const manifest_path = path.join(output_dir, 'manifest.json')
fs.writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n')

console.log(`Content manifest written to ${manifest_path} (${files.length} files)`)
