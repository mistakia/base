#!/usr/bin/env bun

/**
 * Git merge driver for thread metadata.json files.
 *
 * Performs field-level JSON merge instead of line-level text merge,
 * auto-resolving disjoint field updates from different machines.
 *
 * Usage (invoked by git):
 *   node json-merge-driver.mjs %O %A %B %L %P
 *
 * %O = base (ancestor), %A = ours (result written here), %B = theirs
 * Exit 0 = clean merge, non-zero = conflict (falls back to git)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TIMESTAMP_FIELDS = new Set([
  'created_at',
  'updated_at',
  'archived_at',
  'tags_analyzed_at',
  'relations_analyzed_at',
  'visibility_analyzed_at',
  'relations_cleanup_at',
  'start_time',
  'end_time'
])

const ARRAY_FIELDS = new Set([
  'tags',
  'relations',
  'tools',
  'tools_used',
  'bash_commands_used',
  'models',
  'file_references',
  'directory_references'
])

const NESTED_OBJECT_FIELDS = new Set(['source', 'prompt_properties'])

const NUMERIC_MAX_FIELDS = new Set([
  'message_count',
  'tool_call_count',
  'user_message_count',
  'assistant_message_count',
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'entry_count',
  'total_tokens',
  'duration_minutes',
  'duration_ms'
])

export function merge_json({ base, ours, theirs }) {
  const result = { ...ours }
  const all_keys = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs)
  ])

  for (const key of all_keys) {
    const base_val = base[key]
    const ours_val = ours[key]
    const theirs_val = theirs[key]

    const ours_changed = !values_equal(base_val, ours_val)
    const theirs_changed = !values_equal(base_val, theirs_val)

    if (!ours_changed && !theirs_changed) {
      // no changes
      continue
    }

    if (ours_changed && !theirs_changed) {
      // only ours changed, keep ours (already in result)
      continue
    }

    if (!ours_changed && theirs_changed) {
      // only theirs changed, take theirs
      if (theirs_val === undefined) {
        delete result[key]
      } else {
        result[key] = theirs_val
      }
      continue
    }

    // both changed
    if (values_equal(ours_val, theirs_val)) {
      // both changed to the same value
      continue
    }

    // conflict - apply field-specific resolution
    const resolved = resolve_conflict({ key, base_val, ours_val, theirs_val })
    if (resolved === undefined) {
      // unresolvable conflict
      return null
    }
    result[key] = resolved
  }

  return result
}

function resolve_conflict({ key, base_val, ours_val, theirs_val }) {
  if (TIMESTAMP_FIELDS.has(key)) {
    return resolve_timestamp(ours_val, theirs_val)
  }

  if (ARRAY_FIELDS.has(key)) {
    return resolve_array(base_val, ours_val, theirs_val)
  }

  if (NESTED_OBJECT_FIELDS.has(key)) {
    return resolve_nested_object(base_val, ours_val, theirs_val)
  }

  if (NUMERIC_MAX_FIELDS.has(key)) {
    return resolve_numeric_max(ours_val, theirs_val)
  }

  // unknown scalar conflict - take theirs (both sides produce acceptable values)
  return resolve_unknown_scalar({ theirs_val })
}

function resolve_timestamp(ours_val, theirs_val) {
  // take the later timestamp
  if (ours_val == null) return theirs_val
  if (theirs_val == null) return ours_val
  return ours_val >= theirs_val ? ours_val : theirs_val
}

function resolve_array(base_val, ours_val, theirs_val) {
  const base_set = new Set(Array.isArray(base_val) ? base_val : [])
  const ours_set = new Set(Array.isArray(ours_val) ? ours_val : [])
  const theirs_set = new Set(Array.isArray(theirs_val) ? theirs_val : [])

  // Union merge: start with base, add what either side added, remove what either side removed.
  // Note: set-based merge cannot distinguish "kept unchanged" from "removed then re-added
  // in the same commit" -- acceptable for this domain where concurrent remove+re-add is rare.
  const result = new Set(base_set)

  for (const item of ours_set) {
    if (!base_set.has(item)) result.add(item)
  }
  for (const item of theirs_set) {
    if (!base_set.has(item)) result.add(item)
  }

  for (const item of base_set) {
    if (!ours_set.has(item) || !theirs_set.has(item)) {
      result.delete(item)
    }
  }

  return [...result]
}

function resolve_nested_object(base_val, ours_val, theirs_val) {
  const base_obj = base_val && typeof base_val === 'object' ? base_val : {}
  const ours_obj = ours_val && typeof ours_val === 'object' ? ours_val : {}
  const theirs_obj =
    theirs_val && typeof theirs_val === 'object' ? theirs_val : {}

  const result = { ...ours_obj }
  const all_keys = new Set([
    ...Object.keys(base_obj),
    ...Object.keys(ours_obj),
    ...Object.keys(theirs_obj)
  ])

  for (const sub_key of all_keys) {
    const b = base_obj[sub_key]
    const o = ours_obj[sub_key]
    const t = theirs_obj[sub_key]

    const o_changed = !values_equal(b, o)
    const t_changed = !values_equal(b, t)

    if (!o_changed && t_changed) {
      if (t === undefined) {
        delete result[sub_key]
      } else {
        result[sub_key] = t
      }
    } else if (o_changed && t_changed && !values_equal(o, t)) {
      // both changed sub-key to different values - try field-type resolution
      const resolved = resolve_conflict({
        key: sub_key,
        base_val: b,
        ours_val: o,
        theirs_val: t
      })
      if (resolved === undefined) {
        return undefined
      }
      result[sub_key] = resolved
    }
  }

  return result
}

function resolve_numeric_max(ours_val, theirs_val) {
  const o = typeof ours_val === 'number' ? ours_val : 0
  const t = typeof theirs_val === 'number' ? theirs_val : 0
  return Math.max(o, t)
}

function resolve_unknown_scalar({ theirs_val }) {
  return theirs_val
}

function values_equal(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, i) => values_equal(val, b[i]))
  }
  if (typeof a === 'object') {
    const keys_a = Object.keys(a)
    const keys_b = Object.keys(b)
    if (keys_a.length !== keys_b.length) return false
    return keys_a.every((k) => values_equal(a[k], b[k]))
  }
  return false
}

function main() {
  const [, , base_path, ours_path, theirs_path] = process.argv

  if (!base_path || !ours_path || !theirs_path) {
    process.stderr.write(
      'Usage: json-merge-driver.mjs <base> <ours> <theirs> [<marker-size>] [<path>]\n'
    )
    process.exit(1)
  }

  let base, ours, theirs
  try {
    base = JSON.parse(readFileSync(base_path, 'utf8'))
    ours = JSON.parse(readFileSync(ours_path, 'utf8'))
    theirs = JSON.parse(readFileSync(theirs_path, 'utf8'))
  } catch {
    // malformed JSON - fall back to git's text merge
    process.exit(1)
  }

  const result = merge_json({ base, ours, theirs })

  if (result === null) {
    // unresolvable conflict
    process.exit(1)
  }

  writeFileSync(ours_path, JSON.stringify(result, null, 2) + '\n', 'utf8')
  process.exit(0)
}

const is_main =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (is_main) {
  main()
}
