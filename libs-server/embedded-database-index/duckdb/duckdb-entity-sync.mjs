/**
 * DuckDB Entity Sync
 *
 * Functions for syncing tasks, threads, tags, and relations to DuckDB.
 */

import debug from 'debug'
import { execute_duckdb_run } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:sync')

export async function upsert_task_to_duckdb({ connection, task_data }) {
  const {
    entity_id,
    base_uri,
    title,
    status,
    priority,
    description,
    created_at,
    updated_at,
    start_by,
    finish_by,
    planned_start,
    planned_finish,
    started_at,
    finished_at,
    snooze_until,
    estimated_total_duration,
    archived,
    user_public_key
  } = task_data

  if (!entity_id || !base_uri) {
    log('Cannot upsert task without entity_id and base_uri')
    return
  }

  log('Upserting task to DuckDB: %s', base_uri)

  const query = `
    INSERT INTO tasks (
      entity_id, base_uri, title, status, priority, description,
      created_at, updated_at, start_by, finish_by,
      planned_start, planned_finish, started_at, finished_at,
      snooze_until, estimated_total_duration, archived, user_public_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (entity_id) DO UPDATE SET
      base_uri = excluded.base_uri,
      title = excluded.title,
      status = excluded.status,
      priority = excluded.priority,
      description = excluded.description,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      start_by = excluded.start_by,
      finish_by = excluded.finish_by,
      planned_start = excluded.planned_start,
      planned_finish = excluded.planned_finish,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      snooze_until = excluded.snooze_until,
      estimated_total_duration = excluded.estimated_total_duration,
      archived = excluded.archived,
      user_public_key = excluded.user_public_key
  `

  try {
    await execute_duckdb_run({
      query,
      parameters: [
        entity_id,
        base_uri,
        title || null,
        status || null,
        priority || null,
        description || null,
        created_at || null,
        updated_at || null,
        start_by || null,
        finish_by || null,
        planned_start || null,
        planned_finish || null,
        started_at || null,
        finished_at || null,
        snooze_until || null,
        estimated_total_duration || null,
        archived || false,
        user_public_key || null
      ]
    })
    log('Task upserted: %s', base_uri)
  } catch (error) {
    log('Error upserting task: %s', error.message)
    throw error
  }
}

export async function upsert_thread_to_duckdb({ connection, thread_data }) {
  const {
    thread_id,
    title,
    short_description,
    thread_state,
    created_at,
    updated_at,
    message_count,
    user_message_count,
    assistant_message_count,
    tool_call_count,
    total_input_tokens,
    total_output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    total_tokens,
    duration_ms,
    duration_minutes,
    working_directory,
    working_directory_path,
    session_provider,
    inference_provider,
    primary_model,
    user_public_key
  } = thread_data

  if (!thread_id) {
    log('Cannot upsert thread without thread_id')
    return
  }

  log('Upserting thread to DuckDB: %s', thread_id)

  const query = `
    INSERT INTO threads (
      thread_id, title, short_description, thread_state, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      total_input_tokens, total_output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, total_tokens, duration_ms, duration_minutes,
      working_directory, working_directory_path, session_provider,
      inference_provider, primary_model, user_public_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (thread_id) DO UPDATE SET
      title = excluded.title,
      short_description = excluded.short_description,
      thread_state = excluded.thread_state,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      message_count = excluded.message_count,
      user_message_count = excluded.user_message_count,
      assistant_message_count = excluded.assistant_message_count,
      tool_call_count = excluded.tool_call_count,
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      cache_creation_input_tokens = excluded.cache_creation_input_tokens,
      cache_read_input_tokens = excluded.cache_read_input_tokens,
      total_tokens = excluded.total_tokens,
      duration_ms = excluded.duration_ms,
      duration_minutes = excluded.duration_minutes,
      working_directory = excluded.working_directory,
      working_directory_path = excluded.working_directory_path,
      session_provider = excluded.session_provider,
      inference_provider = excluded.inference_provider,
      primary_model = excluded.primary_model,
      user_public_key = excluded.user_public_key
  `

  try {
    await execute_duckdb_run({
      query,
      parameters: [
        thread_id,
        title || null,
        short_description || null,
        thread_state || null,
        created_at || null,
        updated_at || null,
        message_count || null,
        user_message_count || null,
        assistant_message_count || null,
        tool_call_count || null,
        total_input_tokens || null,
        total_output_tokens || null,
        cache_creation_input_tokens || null,
        cache_read_input_tokens || null,
        total_tokens || null,
        duration_ms || null,
        duration_minutes || null,
        working_directory || null,
        working_directory_path || null,
        session_provider || null,
        inference_provider || null,
        primary_model || null,
        user_public_key || null
      ]
    })
    log('Thread upserted: %s', thread_id)
  } catch (error) {
    log('Error upserting thread: %s', error.message)
    throw error
  }
}

export async function sync_entity_tags_to_duckdb({
  connection,
  entity_base_uri,
  tag_base_uris
}) {
  if (!entity_base_uri) {
    return
  }

  log(
    'Syncing %d tags for entity: %s',
    tag_base_uris?.length || 0,
    entity_base_uri
  )

  try {
    // Delete existing tags for this entity
    await execute_duckdb_run({
      query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
      parameters: [entity_base_uri]
    })

    // Insert new tags
    if (tag_base_uris && tag_base_uris.length > 0) {
      for (const tag_base_uri of tag_base_uris) {
        await execute_duckdb_run({
          query:
            'INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES (?, ?)',
          parameters: [entity_base_uri, tag_base_uri]
        })
      }
    }

    log('Entity tags synced: %s', entity_base_uri)
  } catch (error) {
    log('Error syncing entity tags: %s', error.message)
    throw error
  }
}

export async function sync_entity_relations_to_duckdb({
  connection,
  source_base_uri,
  relations
}) {
  if (!source_base_uri) {
    return
  }

  log(
    'Syncing %d relations for entity: %s',
    relations?.length || 0,
    source_base_uri
  )

  try {
    // Delete existing relations from this entity
    await execute_duckdb_run({
      query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
      parameters: [source_base_uri]
    })

    // Insert new relations
    if (relations && relations.length > 0) {
      for (const relation of relations) {
        const { target_base_uri, relation_type, context } = relation
        if (target_base_uri) {
          await execute_duckdb_run({
            query: `INSERT INTO entity_relations (source_base_uri, target_base_uri, relation_type, context)
                    VALUES (?, ?, ?, ?)`,
            parameters: [
              source_base_uri,
              target_base_uri,
              relation_type || null,
              context || null
            ]
          })
        }
      }
    }

    log('Entity relations synced: %s', source_base_uri)
  } catch (error) {
    log('Error syncing entity relations: %s', error.message)
    throw error
  }
}

export async function delete_task_from_duckdb({
  connection,
  entity_id,
  base_uri
}) {
  log('Deleting task from DuckDB: %s', entity_id || base_uri)

  try {
    if (entity_id) {
      await execute_duckdb_run({
        query: 'DELETE FROM tasks WHERE entity_id = ?',
        parameters: [entity_id]
      })
    } else if (base_uri) {
      await execute_duckdb_run({
        query: 'DELETE FROM tasks WHERE base_uri = ?',
        parameters: [base_uri]
      })
    }

    // Also delete related tags and relations
    if (base_uri) {
      await execute_duckdb_run({
        query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
        parameters: [base_uri]
      })
      await execute_duckdb_run({
        query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
        parameters: [base_uri]
      })
    }

    log('Task deleted')
  } catch (error) {
    log('Error deleting task: %s', error.message)
    throw error
  }
}

export async function delete_thread_from_duckdb({ connection, thread_id }) {
  if (!thread_id) {
    return
  }

  log('Deleting thread from DuckDB: %s', thread_id)

  try {
    await execute_duckdb_run({
      query: 'DELETE FROM threads WHERE thread_id = ?',
      parameters: [thread_id]
    })
    log('Thread deleted: %s', thread_id)
  } catch (error) {
    log('Error deleting thread: %s', error.message)
    throw error
  }
}
