#!/usr/bin/env bun
// Ephemeral audit: scans all thread metadata.json files for
// (1) provider_metadata keys outside the consumed allowlist,
// (2) missing schema-required fields,
// (3) any execution-shaped keys anywhere (extra purge-target check).
// Used by formalize-thread-execution-attribution task; delete after completion.

import fs from 'fs/promises'
import path from 'path'

const thread_dir =
  process.argv[2] || path.resolve(process.env.USER_BASE_DIRECTORY || '', 'thread')

const PROVIDER_METADATA_ALLOWLIST = new Set([
  'working_directory',
  'duration_minutes',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'models',
  'file_source',
  'file_path',
  'plan_slug'
])

const REQUIRED_FIELDS = [
  'thread_id',
  'user_public_key',
  'source',
  'thread_state',
  'created_at',
  'updated_at'
]

const EXECUTION_SHAPED = /(execution|container|machine|runtime)/i

const ids = (await fs.readdir(thread_dir, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => e.name)

const provider_metadata_keys = new Map() // key -> count
const out_of_allowlist = new Map() // key -> count
const missing_required = new Map() // field -> count
const exec_shaped_at_root = [] // {thread_id, key}
const exec_shaped_in_source = [] // {thread_id, key}
const exec_shaped_in_pmeta = [] // {thread_id, key}
const unreadable = []

let processed = 0
for (const tid of ids) {
  const mp = path.join(thread_dir, tid, 'metadata.json')
  let raw
  try {
    raw = await fs.readFile(mp, 'utf8')
  } catch (e) {
    unreadable.push({ tid, err: e.code || e.message })
    continue
  }
  let m
  try {
    m = JSON.parse(raw)
  } catch (e) {
    unreadable.push({ tid, err: 'parse: ' + e.message })
    continue
  }
  processed++

  for (const f of REQUIRED_FIELDS) {
    if (m[f] === undefined || m[f] === null || m[f] === '') {
      missing_required.set(f, (missing_required.get(f) || 0) + 1)
    }
  }

  for (const k of Object.keys(m)) {
    if (EXECUTION_SHAPED.test(k)) exec_shaped_at_root.push({ tid, k })
  }
  if (m.source && typeof m.source === 'object') {
    for (const k of Object.keys(m.source)) {
      if (EXECUTION_SHAPED.test(k)) exec_shaped_in_source.push({ tid, k })
    }
    const pm = m.source.provider_metadata
    if (pm && typeof pm === 'object') {
      for (const k of Object.keys(pm)) {
        provider_metadata_keys.set(k, (provider_metadata_keys.get(k) || 0) + 1)
        if (!PROVIDER_METADATA_ALLOWLIST.has(k)) {
          out_of_allowlist.set(k, (out_of_allowlist.get(k) || 0) + 1)
        }
        if (EXECUTION_SHAPED.test(k)) exec_shaped_in_pmeta.push({ tid, k })
      }
    }
  }
}

const sorted = (m) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`)

console.log(`Total directories scanned: ${ids.length}`)
console.log(`Successfully parsed:        ${processed}`)
console.log(`Unreadable / unparseable:   ${unreadable.length}`)
if (unreadable.length) {
  console.log('  Sample (first 10):')
  for (const u of unreadable.slice(0, 10)) console.log(`    ${u.tid}: ${u.err}`)
}

console.log('\n--- Missing required fields (count of threads) ---')
if (missing_required.size === 0) console.log('  (none)')
else for (const line of sorted(missing_required)) console.log(`  ${line}`)

console.log('\n--- All provider_metadata keys observed ---')
if (provider_metadata_keys.size === 0) console.log('  (none)')
else for (const line of sorted(provider_metadata_keys)) console.log(`  ${line}`)

console.log('\n--- provider_metadata keys OUT of allowlist ---')
if (out_of_allowlist.size === 0) console.log('  (none)')
else for (const line of sorted(out_of_allowlist)) console.log(`  ${line}`)

console.log('\n--- Execution-shaped keys at metadata root ---')
console.log(`  count: ${exec_shaped_at_root.length}`)
const root_keys = new Map()
for (const e of exec_shaped_at_root) {
  root_keys.set(e.k, (root_keys.get(e.k) || 0) + 1)
}
for (const line of sorted(root_keys)) console.log(`  ${line}`)

console.log('\n--- Execution-shaped keys inside source.* ---')
console.log(`  count: ${exec_shaped_in_source.length}`)
const src_keys = new Map()
for (const e of exec_shaped_in_source) {
  src_keys.set(e.k, (src_keys.get(e.k) || 0) + 1)
}
for (const line of sorted(src_keys)) console.log(`  ${line}`)

console.log('\n--- Execution-shaped keys inside source.provider_metadata.* ---')
console.log(`  count: ${exec_shaped_in_pmeta.length}`)
const pm_keys = new Map()
for (const e of exec_shaped_in_pmeta) {
  pm_keys.set(e.k, (pm_keys.get(e.k) || 0) + 1)
}
for (const line of sorted(pm_keys)) console.log(`  ${line}`)
if (exec_shaped_in_pmeta.length) {
  console.log('  Sample (first 10):')
  for (const e of exec_shaped_in_pmeta.slice(0, 10))
    console.log(`    ${e.tid}: ${e.k}`)
}
