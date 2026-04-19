import path from 'path'
import debug from 'debug'

import get_thread from './get-thread.mjs'
import { validate_thread_message_role } from './threads-constants.mjs'
import {
  append_timeline_entry_jsonl,
  read_timeline_jsonl_or_default
} from '#libs-server/threads/timeline/index.mjs'
import { read_modify_write } from '#libs-server/filesystem/optimistic-write.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

const log = debug('threads:timeline')

// Valid timeline entry types (5 primitives)
const VALID_ENTRY_TYPES = [
  'message',
  'tool_call',
  'tool_result',
  'thinking',
  'system'
]

const VALID_SYSTEM_TYPES = [
  'status',
  'state_change',
  'error',
  'configuration',
  'compaction',
  'branch_point'
]

// Per-system_type required metadata contracts. Mirrors the JSON Schema
// allOf/if-then blocks in system/text/thread-timeline-schema.json so
// runtime writes fail fast without needing ajv in the hot path.
const SYSTEM_TYPE_REQUIRED_METADATA = {
  state_change: ['from_state', 'to_state'],
  error: ['error_type']
}

// Validation functions for different entry types
export const entry_validators = {
  message: (entry) => {
    if (!entry.role) throw new Error('message entry must have a role')

    // Validate using the standardized roles
    try {
      validate_thread_message_role(entry.role)
    } catch (error) {
      throw new Error(`Invalid message role: ${error.message}`)
    }

    if (!entry.content) throw new Error('message entry must have content')
  },

  tool_call: (entry) => {
    if (!entry.content.tool_name)
      throw new Error('tool_call entry must have a tool_name')
    if (!entry.content.tool_parameters)
      throw new Error('tool_call entry must have parameters')
  },

  tool_result: (entry) => {
    if (!entry.content?.tool_call_id)
      throw new Error('tool_result entry must have tool_call_id')
    if (
      entry.content.result === undefined &&
      entry.content.error === undefined
    )
      throw new Error('tool_result entry must have result or error')
  },

  thinking: (entry) => {
    if (entry.content === undefined || entry.content === null)
      throw new Error('thinking entry must have content')
  },

  system: (entry) => {
    if (entry.content === undefined || entry.content === null)
      throw new Error('system entry must have content')
    if (
      entry.system_type !== undefined &&
      !VALID_SYSTEM_TYPES.includes(entry.system_type)
    ) {
      throw new Error(
        `Invalid system_type: ${entry.system_type}. Must be one of: ${VALID_SYSTEM_TYPES.join(', ')}`
      )
    }
    const required_metadata = SYSTEM_TYPE_REQUIRED_METADATA[entry.system_type]
    if (required_metadata) {
      const metadata = entry.metadata || {}
      const missing = required_metadata.filter((key) => metadata[key] == null)
      if (missing.length > 0) {
        throw new Error(
          `system_type '${entry.system_type}' requires metadata fields: ${missing.join(', ')}`
        )
      }
    }
  }
}

/**
 * Add an entry to a thread's timeline
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {Object} params.entry Timeline entry to add
 * @returns {Promise<Object>} Updated thread data
 */
export default async function add_timeline_entry({ thread_id, entry }) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error('entry is required and must be an object')
  }

  if (!entry.type) {
    throw new Error('entry must have a type')
  }

  if (!VALID_ENTRY_TYPES.includes(entry.type)) {
    throw new Error(
      `Invalid entry type: ${entry.type}. Must be one of: ${VALID_ENTRY_TYPES.join(', ')}`
    )
  }

  // Get the thread (validates existence and gets context_dir)
  const thread = await get_thread({
    thread_id
  })

  // Clone the entry to avoid modifying the original
  const new_entry = { ...entry }

  // Set timestamp and ID if not provided
  if (!new_entry.timestamp) {
    new_entry.timestamp = new Date().toISOString()
  }

  // id is the caller's responsibility. Importers use
  // libs-shared/timeline/deterministic-id.mjs so re-imports are idempotent;
  // runtime callers explicitly call uuid() at their own site so the
  // non-determinism is visible there. No silent fallback here.
  if (!new_entry.id) {
    throw new Error(
      'entry.id is required. Importers should use deterministic_timeline_entry_id; runtime callers should pass uuid() explicitly.'
    )
  }

  // Backstop: stamp current schema version on any caller that did not provide
  // one. Validate explicitly-provided versions are positive integers.
  if (new_entry.schema_version === undefined) {
    new_entry.schema_version = TIMELINE_SCHEMA_VERSION
    log(
      `schema_version backstop: stamped v${TIMELINE_SCHEMA_VERSION} on ${new_entry.type} entry for thread ${thread_id}`
    )
  } else if (
    !Number.isInteger(new_entry.schema_version) ||
    new_entry.schema_version < 1
  ) {
    throw new Error(
      `Invalid schema_version: ${new_entry.schema_version}. Must be a positive integer.`
    )
  }

  // Validate entry based on type
  if (entry_validators[new_entry.type]) {
    try {
      entry_validators[new_entry.type](new_entry)
    } catch (error) {
      throw new Error(`Invalid ${new_entry.type} entry: ${error.message}`)
    }
  }

  log(`Adding ${new_entry.type} entry to thread ${thread_id}`)

  const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')

  // Append entry to timeline (streaming write - avoids read-modify-write)
  await append_timeline_entry_jsonl({ timeline_path, entry: new_entry })

  // Update metadata.updated_at with optimistic concurrency
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const written = await read_modify_write({
    absolute_path: metadata_path,
    modify: (content) => {
      const metadata = JSON.parse(content)
      metadata.updated_at = new_entry.timestamp
      return JSON.stringify(metadata, null, 2)
    }
  })
  const metadata = JSON.parse(written)

  // Read updated timeline for return value
  const timeline = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })

  // Return updated thread data
  return {
    ...metadata,
    timeline,
    context_dir: thread.context_dir
  }
}
