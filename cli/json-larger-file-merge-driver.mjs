#!/usr/bin/env node

/**
 * Git merge driver that takes the larger file.
 *
 * For files like normalized-session.json where the more complete import
 * (larger file) is always the correct version.
 *
 * Usage (invoked by git):
 *   node json-larger-file-merge-driver.mjs %O %A %B
 *
 * %O = base (ancestor), %A = ours (result written here), %B = theirs
 * Exit 0 = clean merge
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function merge_take_larger({ ours_content, theirs_content }) {
  const ours_size = Buffer.byteLength(ours_content, 'utf8')
  const theirs_size = Buffer.byteLength(theirs_content, 'utf8')

  // Take larger file; if same size, take theirs (arbitrary but deterministic)
  if (theirs_size >= ours_size) {
    return theirs_content
  }
  return ours_content
}

function main() {
  const [, , base_path, ours_path, theirs_path] = process.argv

  if (!base_path || !ours_path || !theirs_path) {
    process.stderr.write(
      'Usage: json-larger-file-merge-driver.mjs <base> <ours> <theirs>\n'
    )
    process.exit(1)
  }

  let ours_content, theirs_content
  try {
    ours_content = readFileSync(ours_path, 'utf8')
    theirs_content = readFileSync(theirs_path, 'utf8')
  } catch {
    process.exit(1)
  }

  const result = merge_take_larger({ ours_content, theirs_content })
  writeFileSync(ours_path, result, 'utf8')
  process.exit(0)
}

const is_main =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (is_main) {
  main()
}
