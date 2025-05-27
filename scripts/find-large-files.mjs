#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

// Read ignore patterns from .gitignore and .cursorignore
const read_ignore_file = (filename) => {
  try {
    const content = fs.readFileSync(path.join(ROOT_DIR, filename), 'utf8')
    return content
      .split('\n')
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
      .map((line) => line.trim())
  } catch (error) {
    console.error(`Error reading ${filename}:`, error.message)
    return []
  }
}

const git_ignore_patterns = read_ignore_file('.gitignore')
const cursor_ignore_patterns = read_ignore_file('.cursorignore')
const all_ignore_patterns = [...git_ignore_patterns, ...cursor_ignore_patterns]

// Function to check if a file should be ignored
const should_ignore = (file_path) => {
  const relative_path = path.relative(ROOT_DIR, file_path)

  // Check each ignore pattern
  for (const pattern of all_ignore_patterns) {
    if (pattern.endsWith('/')) {
      // Directory pattern
      if (relative_path.startsWith(pattern)) return true
    } else if (pattern.includes('*')) {
      // Simple glob pattern
      const regex_pattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')
      const regex = new RegExp(`^${regex_pattern}$`)
      if (regex.test(relative_path)) return true

      // Also check if any parent directory matches the pattern
      const dirs = relative_path.split(path.sep)
      for (let i = 1; i <= dirs.length; i++) {
        const partial_path = dirs.slice(0, i).join(path.sep)
        if (regex.test(partial_path)) return true
      }
    } else {
      // Exact match
      if (relative_path === pattern) return true
    }
  }

  return false
}

// Function to count lines in a file
const count_lines = (file_path) => {
  try {
    const content = fs.readFileSync(file_path, 'utf8')
    return content.split('\n').length
  } catch (error) {
    return 0
  }
}

// Function to find all files recursively
const find_files = (dir, results = []) => {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const file_path = path.join(dir, file)
    if (should_ignore(file_path)) continue

    const stat = fs.statSync(file_path)

    if (stat.isDirectory()) {
      find_files(file_path, results)
    } else if (stat.isFile()) {
      const line_count = count_lines(file_path)
      if (line_count >= 200) {
        results.push({
          path: path.relative(ROOT_DIR, file_path),
          lines: line_count
        })
      }
    }
  }

  return results
}

// Main function
const main = () => {
  console.log('Finding large files...')

  const file_results = find_files(ROOT_DIR)

  // Sort by line count, descending
  file_results.sort((a, b) => b.lines - a.lines)

  // Take top 100
  const top_files = file_results.slice(0, 100)

  console.log(
    `\nTop ${top_files.length} files by line count (minimum 200 lines):\n`
  )

  // Print results in a nice format
  top_files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.path} (${file.lines} lines)`)
  })
}

main()
