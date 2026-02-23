#!/usr/bin/env node

/**
 * Git merge driver for append-only JSONL files.
 *
 * Merges JSONL files by taking the union of appended lines beyond the
 * common base. If either side modified (not just appended) lines present
 * in base, exits non-zero to fall back to git's text merge.
 *
 * Usage (invoked by git):
 *   node jsonl-merge-driver.mjs %O %A %B
 *
 * %O = base (ancestor), %A = ours (result written here), %B = theirs
 * Exit 0 = clean merge, non-zero = conflict (falls back to git)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function merge_jsonl({ base_lines, ours_lines, theirs_lines }) {
  // Find the common prefix length with base for each side
  const base_len = base_lines.length
  const ours_prefix_len = common_prefix_length(base_lines, ours_lines)
  const theirs_prefix_len = common_prefix_length(base_lines, theirs_lines)

  // If either side modified lines present in base (not just appended), fail
  if (ours_prefix_len < base_len || theirs_prefix_len < base_len) {
    return null
  }

  // Lines appended beyond base by each side
  const ours_appended = ours_lines.slice(base_len)
  const theirs_appended = theirs_lines.slice(base_len)

  // Deduplicate: union of appended lines
  const seen = new Set(ours_appended)
  const theirs_unique = theirs_appended.filter((line) => !seen.has(line))

  return [...base_lines, ...ours_appended, ...theirs_unique]
}

function common_prefix_length(a, b) {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i
  }
  return len
}

function read_lines(file_path) {
  const content = readFileSync(file_path, 'utf8')
  if (content === '') return []
  const lines = content.split('\n')
  // Remove trailing empty line from final newline
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function main() {
  const [, , base_path, ours_path, theirs_path] = process.argv

  if (!base_path || !ours_path || !theirs_path) {
    process.stderr.write(
      'Usage: jsonl-merge-driver.mjs <base> <ours> <theirs>\n'
    )
    process.exit(1)
  }

  let base_lines, ours_lines, theirs_lines
  try {
    base_lines = read_lines(base_path)
    ours_lines = read_lines(ours_path)
    theirs_lines = read_lines(theirs_path)
  } catch {
    process.exit(1)
  }

  const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

  if (result === null) {
    process.exit(1)
  }

  const output = result.length > 0 ? result.join('\n') + '\n' : ''
  writeFileSync(ours_path, output, 'utf8')
  process.exit(0)
}

const is_main =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (is_main) {
  main()
}
