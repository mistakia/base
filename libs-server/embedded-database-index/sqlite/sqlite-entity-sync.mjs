/**
 * SQLite Entity Sync
 *
 * Functions for syncing entities, threads, tags, and relations to SQLite.
 */

import debug from 'debug'

import {
  execute_sqlite_run,
  execute_sqlite_query,
  with_sqlite_transaction
} from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:sync')

export async function upsert_thread_to_sqlite({ thread_data }) {
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
    source_provider,
    inference_provider,
    user_public_key,
    latest_event_timestamp,
    latest_event_type,
    latest_event_data,
    edit_count,
    lines_changed,
    file_references,
    directory_references,
    public_read,
    visibility_analyzed_at,
    archived_at,
    archive_reason,
    external_session_id,
    has_continuation_prompt,
    continuation_prompt_count
  } = thread_data

  const primary_model =
    thread_data.primary_model ||
    (thread_data.models && thread_data.models[0]) ||
    thread_data.external_session?.provider_metadata?.models?.[0] ||
    null

  if (!thread_id) {
    log('Cannot upsert thread without thread_id')
    return
  }

  log('Upserting thread to SQLite: %s', thread_id)

  const query = `
    INSERT INTO threads (
      thread_id, title, short_description, thread_state, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      total_input_tokens, total_output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, total_tokens, duration_ms, duration_minutes,
      working_directory, working_directory_path, source_provider,
      inference_provider, primary_model, user_public_key,
      latest_event_timestamp, latest_event_type, latest_event_data,
      edit_count, lines_changed, file_references, directory_references,
      public_read, visibility_analyzed_at, archived_at, archive_reason,
      external_session_id, has_continuation_prompt, continuation_prompt_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      source_provider = excluded.source_provider,
      inference_provider = excluded.inference_provider,
      primary_model = excluded.primary_model,
      user_public_key = excluded.user_public_key,
      latest_event_timestamp = excluded.latest_event_timestamp,
      latest_event_type = excluded.latest_event_type,
      latest_event_data = excluded.latest_event_data,
      edit_count = excluded.edit_count,
      lines_changed = excluded.lines_changed,
      file_references = excluded.file_references,
      directory_references = excluded.directory_references,
      public_read = excluded.public_read,
      visibility_analyzed_at = excluded.visibility_analyzed_at,
      archived_at = excluded.archived_at,
      archive_reason = excluded.archive_reason,
      external_session_id = excluded.external_session_id,
      has_continuation_prompt = excluded.has_continuation_prompt,
      continuation_prompt_count = excluded.continuation_prompt_count
  `

  try {
    await execute_sqlite_run({
      query,
      parameters: [
        thread_id,
        title,
        short_description,
        thread_state,
        created_at,
        updated_at,
        message_count ?? 0,
        user_message_count ?? 0,
        assistant_message_count ?? 0,
        tool_call_count ?? 0,
        total_input_tokens ?? 0,
        total_output_tokens ?? 0,
        cache_creation_input_tokens ?? 0,
        cache_read_input_tokens ?? 0,
        total_tokens ?? 0,
        duration_ms ?? 0,
        duration_minutes ?? 0,
        working_directory,
        working_directory_path,
        source_provider,
        inference_provider,
        primary_model,
        user_public_key,
        latest_event_timestamp,
        latest_event_type,
        latest_event_data,
        edit_count ?? 0,
        lines_changed ?? 0,
        file_references ?? null,
        directory_references ?? null,
        public_read ?? null,
        visibility_analyzed_at ?? null,
        archived_at ?? null,
        archive_reason ?? null,
        external_session_id ?? null,
        has_continuation_prompt == null
          ? null
          : has_continuation_prompt
            ? 1
            : 0,
        continuation_prompt_count ?? null
      ]
    })
    log('Thread upserted: %s', thread_id)
  } catch (error) {
    log('Error upserting thread: %s', error.message)
    throw error
  }
}

export async function sync_entity_tags_to_sqlite({
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
    await execute_sqlite_run({
      query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
      parameters: [entity_base_uri]
    })

    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]
      const placeholders = unique_tags.map(() => '(?, ?)').join(', ')
      const parameters = unique_tags.flatMap((tag_base_uri) => [
        entity_base_uri,
        tag_base_uri
      ])

      await execute_sqlite_run({
        query: `INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES ${placeholders}`,
        parameters
      })
    }

    log('Entity tags synced: %s', entity_base_uri)
  } catch (error) {
    log('Error syncing entity tags: %s', error.message)
    throw error
  }
}

export async function sync_entity_relations_to_sqlite({
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
    await execute_sqlite_run({
      query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
      parameters: [source_base_uri]
    })

    if (relations && relations.length > 0) {
      const valid_relations = relations.filter((r) => r.target_base_uri)

      if (valid_relations.length > 0) {
        const placeholders = valid_relations
          .map(() => '(?, ?, ?, ?)')
          .join(', ')
        const parameters = valid_relations.flatMap((relation) => [
          source_base_uri,
          relation.target_base_uri,
          relation.relation_type || 'unknown',
          relation.context || null
        ])

        await execute_sqlite_run({
          query: `INSERT INTO entity_relations (source_base_uri, target_base_uri, relation_type, context)
                  VALUES ${placeholders}
                  ON CONFLICT DO UPDATE SET context = excluded.context`,
          parameters
        })
      }
    }

    log('Entity relations synced: %s', source_base_uri)
  } catch (error) {
    log('Error syncing entity relations: %s', error.message)
    throw error
  }
}

export async function sync_entity_content_wikilinks_to_sqlite({
  source_base_uri,
  target_base_uris
}) {
  if (!source_base_uri) {
    return
  }

  const unique_targets = [
    ...new Set(
      (target_base_uris || []).filter(
        (target) => typeof target === 'string' && target.length > 0
      )
    )
  ]

  log(
    'Syncing %d content wikilinks for entity: %s',
    unique_targets.length,
    source_base_uri
  )

  await with_sqlite_transaction(async () => {
    await execute_sqlite_run({
      query: 'DELETE FROM entity_content_wikilinks WHERE source_base_uri = ?',
      parameters: [source_base_uri]
    })

    if (unique_targets.length > 0) {
      const placeholders = unique_targets.map(() => '(?, ?)').join(', ')
      const parameters = unique_targets.flatMap((target) => [
        source_base_uri,
        target
      ])

      await execute_sqlite_run({
        query: `INSERT INTO entity_content_wikilinks (source_base_uri, target_base_uri)
                VALUES ${placeholders}
                ON CONFLICT DO NOTHING`,
        parameters
      })
    }
  })
}

export async function sync_entities_content_wikilinks_batch({
  entity_wikilinks
}) {
  if (!entity_wikilinks || entity_wikilinks.length === 0) return

  const source_base_uris = entity_wikilinks.map((ew) => ew.source_base_uri)

  const pairs = []
  for (const { source_base_uri, target_base_uris } of entity_wikilinks) {
    if (!target_base_uris) continue
    const unique_targets = [
      ...new Set(
        target_base_uris.filter((t) => typeof t === 'string' && t.length > 0)
      )
    ]
    for (const target of unique_targets) {
      pairs.push([source_base_uri, target])
    }
  }

  await with_sqlite_transaction(async () => {
    for (let i = 0; i < source_base_uris.length; i += BATCH_CHUNK_SIZE) {
      const chunk = source_base_uris.slice(i, i + BATCH_CHUNK_SIZE)
      const placeholders = chunk.map(() => '?').join(', ')
      await execute_sqlite_run({
        query: `DELETE FROM entity_content_wikilinks WHERE source_base_uri IN (${placeholders})`,
        parameters: chunk
      })
    }

    for (let i = 0; i < pairs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + BATCH_CHUNK_SIZE)
      const placeholders = chunk.map(() => '(?, ?)').join(', ')
      const parameters = chunk.flat()
      await execute_sqlite_run({
        query: `INSERT INTO entity_content_wikilinks (source_base_uri, target_base_uri)
                VALUES ${placeholders}
                ON CONFLICT DO NOTHING`,
        parameters
      })
    }
  })
}

function compute_unique_aliases({ alias_base_uris, entity_base_uri }) {
  return [
    ...new Set(
      (alias_base_uris || []).filter(
        (alias) =>
          typeof alias === 'string' &&
          alias.length > 0 &&
          alias !== entity_base_uri
      )
    )
  ]
}

export async function sync_entity_aliases_to_sqlite({
  entity_base_uri,
  entity_id,
  alias_base_uris
}) {
  if (!entity_base_uri) return
  if (!entity_id) {
    if (Array.isArray(alias_base_uris) && alias_base_uris.length > 0) {
      log(
        'Skipping alias sync for %s: entity_id missing on entity with %d aliases',
        entity_base_uri,
        alias_base_uris.length
      )
    }
    return
  }

  const unique_aliases = compute_unique_aliases({
    alias_base_uris,
    entity_base_uri
  })

  log(
    'Syncing %d aliases for entity: %s',
    unique_aliases.length,
    entity_base_uri
  )

  await with_sqlite_transaction(async () => {
    // Multi-hop coverage: keep current_base_uri in sync on all rows for this
    // entity_id, even aliases recorded by earlier moves
    await execute_sqlite_run({
      query:
        'UPDATE entity_aliases SET current_base_uri = ? WHERE entity_id = ?',
      parameters: [entity_base_uri, entity_id]
    })

    if (unique_aliases.length > 0) {
      const placeholders = unique_aliases.map(() => '?').join(', ')
      await execute_sqlite_run({
        query: `DELETE FROM entity_aliases WHERE entity_id = ? AND alias_base_uri NOT IN (${placeholders})`,
        parameters: [entity_id, ...unique_aliases]
      })

      const now = new Date().toISOString()
      const insert_placeholders = unique_aliases
        .map(() => '(?, ?, ?, ?)')
        .join(', ')
      const parameters = unique_aliases.flatMap((alias) => [
        alias,
        entity_base_uri,
        entity_id,
        now
      ])

      await execute_sqlite_run({
        query: `INSERT INTO entity_aliases (alias_base_uri, current_base_uri, entity_id, recorded_at)
                VALUES ${insert_placeholders}
                ON CONFLICT(alias_base_uri) DO UPDATE SET
                  current_base_uri = excluded.current_base_uri,
                  entity_id = excluded.entity_id`,
        parameters
      })
    } else {
      await execute_sqlite_run({
        query: 'DELETE FROM entity_aliases WHERE entity_id = ?',
        parameters: [entity_id]
      })
    }
  })
}

export async function sync_thread_references_to_sqlite({
  thread_id,
  relation_targets,
  file_reference_targets
}) {
  if (!thread_id) return

  log('Syncing references for thread: %s', thread_id)

  const tuples = []
  const seen = new Set()
  for (const target of relation_targets || []) {
    if (typeof target !== 'string' || !target) continue
    const key = `metadata.relations|${target}`
    if (seen.has(key)) continue
    seen.add(key)
    tuples.push([thread_id, target, 'metadata.relations'])
  }
  for (const target of file_reference_targets || []) {
    if (typeof target !== 'string' || !target) continue
    const key = `metadata.file_references|${target}`
    if (seen.has(key)) continue
    seen.add(key)
    tuples.push([thread_id, target, 'metadata.file_references'])
  }

  await with_sqlite_transaction(async () => {
    await execute_sqlite_run({
      query: 'DELETE FROM thread_references WHERE thread_id = ?',
      parameters: [thread_id]
    })

    if (tuples.length > 0) {
      const placeholders = tuples.map(() => '(?, ?, ?)').join(', ')
      const parameters = tuples.flat()
      await execute_sqlite_run({
        query: `INSERT INTO thread_references (thread_id, target_base_uri, location)
                VALUES ${placeholders}
                ON CONFLICT DO NOTHING`,
        parameters
      })
    }
  })
}

export async function sync_thread_tags_to_sqlite({ thread_id, tag_base_uris }) {
  if (!thread_id) {
    return
  }

  log('Syncing %d tags for thread: %s', tag_base_uris?.length || 0, thread_id)

  try {
    await execute_sqlite_run({
      query: 'DELETE FROM thread_tags WHERE thread_id = ?',
      parameters: [thread_id]
    })

    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]
      const placeholders = unique_tags.map(() => '(?, ?)').join(', ')
      const parameters = unique_tags.flatMap((tag_base_uri) => [
        thread_id,
        tag_base_uri
      ])

      await execute_sqlite_run({
        query: `INSERT INTO thread_tags (thread_id, tag_base_uri) VALUES ${placeholders}`,
        parameters
      })
    }

    log('Thread tags synced: %s', thread_id)
  } catch (error) {
    log('Error syncing thread tags: %s', error.message)
    throw error
  }
}

export async function delete_thread_from_sqlite({ thread_id }) {
  if (!thread_id) {
    return
  }

  log('Deleting thread from SQLite: %s', thread_id)

  try {
    await execute_sqlite_run({
      query: 'DELETE FROM thread_tags WHERE thread_id = ?',
      parameters: [thread_id]
    })

    await execute_sqlite_run({
      query: 'DELETE FROM threads WHERE thread_id = ?',
      parameters: [thread_id]
    })
    log('Thread deleted: %s', thread_id)
  } catch (error) {
    log('Error deleting thread: %s', error.message)
    throw error
  }
}

export async function upsert_entity_to_sqlite({ entity_data }) {
  const { frontmatter, base_uri, entity_id, type } = entity_data

  if (!base_uri || !entity_id || !type) {
    log('Cannot upsert entity without base_uri, entity_id, and type')
    return
  }

  const user_public_key_value =
    frontmatter?.user_public_key || entity_data.user_public_key
  if (!user_public_key_value) {
    throw new Error(
      `Entity ${base_uri} is missing required field: user_public_key`
    )
  }

  log('Upserting entity to SQLite: %s (%s)', base_uri, type)

  const title = frontmatter?.title || null
  const description = frontmatter?.description || null
  const body = typeof entity_data.body === 'string' ? entity_data.body : null
  const status = frontmatter?.status || null
  const priority = frontmatter?.priority || null
  const archived = frontmatter?.archived ? 1 : 0
  const user_public_key =
    frontmatter?.user_public_key || entity_data.user_public_key
  const now = new Date().toISOString()
  const created_at = frontmatter?.created_at || now
  const updated_at = frontmatter?.updated_at || now
  const archived_at = frontmatter?.archived_at || null
  const public_read =
    frontmatter?.public_read != null ? (frontmatter.public_read ? 1 : 0) : null
  const visibility_analyzed_at = frontmatter?.visibility_analyzed_at || null

  const query = `
    INSERT INTO entities (
      base_uri, entity_id, type, title, description, body, status, priority,
      archived, public_read, visibility_analyzed_at,
      user_public_key, created_at, updated_at, archived_at, frontmatter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (base_uri) DO UPDATE SET
      entity_id = excluded.entity_id,
      type = excluded.type,
      title = excluded.title,
      description = excluded.description,
      body = excluded.body,
      status = excluded.status,
      priority = excluded.priority,
      archived = excluded.archived,
      public_read = excluded.public_read,
      visibility_analyzed_at = excluded.visibility_analyzed_at,
      user_public_key = excluded.user_public_key,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      archived_at = excluded.archived_at,
      frontmatter = excluded.frontmatter
  `

  const parameters = [
    base_uri,
    entity_id,
    type,
    title,
    description,
    body,
    status,
    priority,
    archived,
    public_read,
    visibility_analyzed_at,
    user_public_key,
    created_at,
    updated_at,
    archived_at,
    JSON.stringify(frontmatter || {})
  ]

  try {
    await execute_sqlite_run({ query, parameters })
    log('Entity upserted: %s', base_uri)
  } catch (error) {
    // Handle entity_id unique constraint violation
    if (
      error.message &&
      error.message.includes('UNIQUE constraint failed: entities.entity_id')
    ) {
      log(
        'Entity_id conflict for %s, removing stale entry and retrying',
        base_uri
      )
      await execute_sqlite_run({
        query: 'DELETE FROM entities WHERE entity_id = ? AND base_uri != ?',
        parameters: [entity_id, base_uri]
      })
      await execute_sqlite_run({ query, parameters })
      log('Entity upserted after conflict resolution: %s', base_uri)
    } else {
      log('Error upserting entity: %s', error.message)
      throw error
    }
  }
}

export async function delete_entity_from_sqlite({ entity_id, base_uri }) {
  if (!base_uri && !entity_id) {
    log('Cannot delete entity without base_uri or entity_id')
    return
  }

  log('Deleting entity from SQLite: %s', entity_id || base_uri)

  try {
    let resolved_entity_id = entity_id
    let resolved_base_uri = base_uri

    if (!resolved_entity_id && resolved_base_uri) {
      const rows = await execute_sqlite_query({
        query: 'SELECT entity_id FROM entities WHERE base_uri = ?',
        parameters: [resolved_base_uri]
      })
      resolved_entity_id = rows[0]?.entity_id
      if (!resolved_entity_id) {
        // Stale base_uri: try alias table to recover entity_id
        const alias_rows = await execute_sqlite_query({
          query:
            'SELECT entity_id FROM entity_aliases WHERE alias_base_uri = ? LIMIT 1',
          parameters: [resolved_base_uri]
        })
        resolved_entity_id = alias_rows[0]?.entity_id
      }
    }

    if (!resolved_base_uri && resolved_entity_id) {
      const rows = await execute_sqlite_query({
        query: 'SELECT base_uri FROM entities WHERE entity_id = ?',
        parameters: [resolved_entity_id]
      })
      resolved_base_uri = rows[0]?.base_uri
    }

    if (!resolved_base_uri && !resolved_entity_id) {
      log('Entity not found for deletion: %s', entity_id || base_uri)
      return
    }

    if (resolved_base_uri) {
      await execute_sqlite_run({
        query: 'DELETE FROM entities WHERE base_uri = ?',
        parameters: [resolved_base_uri]
      })
      await execute_sqlite_run({
        query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
        parameters: [resolved_base_uri]
      })
      await execute_sqlite_run({
        query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
        parameters: [resolved_base_uri]
      })
      await execute_sqlite_run({
        query: 'DELETE FROM entity_content_wikilinks WHERE source_base_uri = ?',
        parameters: [resolved_base_uri]
      })
    }

    if (resolved_entity_id) {
      await execute_sqlite_run({
        query: 'DELETE FROM entity_aliases WHERE entity_id = ?',
        parameters: [resolved_entity_id]
      })
    }

    log('Entity deleted: %s', resolved_base_uri || resolved_entity_id)
  } catch (error) {
    log('Error deleting entity: %s', error.message)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Batch operations for full rebuild
// ---------------------------------------------------------------------------

export const BATCH_CHUNK_SIZE = 50

export async function upsert_entities_batch({ entities }) {
  if (!entities || entities.length === 0) return

  log('Batch upserting %d entities', entities.length)

  for (let i = 0; i < entities.length; i += BATCH_CHUNK_SIZE) {
    const chunk = entities.slice(i, i + BATCH_CHUNK_SIZE)

    for (const entity_data of chunk) {
      if (entity_data.entity_id && entity_data.base_uri) {
        await execute_sqlite_run({
          query: 'DELETE FROM entities WHERE entity_id = ? AND base_uri != ?',
          parameters: [entity_data.entity_id, entity_data.base_uri]
        })
      }
    }

    const placeholders = chunk
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ')

    const parameters = chunk.flatMap((entity_data) => {
      const { frontmatter, base_uri, entity_id, type } = entity_data
      const now = new Date().toISOString()

      return [
        base_uri,
        entity_id,
        type,
        frontmatter?.title || null,
        frontmatter?.description || null,
        typeof entity_data.body === 'string' ? entity_data.body : null,
        frontmatter?.status || null,
        frontmatter?.priority || null,
        frontmatter?.archived ? 1 : 0,
        frontmatter?.public_read != null
          ? frontmatter.public_read
            ? 1
            : 0
          : null,
        frontmatter?.visibility_analyzed_at || null,
        frontmatter?.user_public_key || entity_data.user_public_key,
        frontmatter?.created_at || now,
        frontmatter?.updated_at || now,
        frontmatter?.archived_at || null,
        JSON.stringify(frontmatter || {})
      ]
    })

    await execute_sqlite_run({
      query: `
        INSERT INTO entities (
          base_uri, entity_id, type, title, description, body, status, priority,
          archived, public_read, visibility_analyzed_at,
          user_public_key, created_at, updated_at, archived_at, frontmatter
        ) VALUES ${placeholders}
        ON CONFLICT (base_uri) DO UPDATE SET
          entity_id = excluded.entity_id,
          type = excluded.type,
          title = excluded.title,
          description = excluded.description,
          body = excluded.body,
          status = excluded.status,
          priority = excluded.priority,
          archived = excluded.archived,
          public_read = excluded.public_read,
          visibility_analyzed_at = excluded.visibility_analyzed_at,
          user_public_key = excluded.user_public_key,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at,
          frontmatter = excluded.frontmatter
      `,
      parameters
    })
  }

  log('Batch upserted %d entities', entities.length)
}

export async function sync_entities_tags_batch({ entity_tags }) {
  if (!entity_tags || entity_tags.length === 0) return

  const entity_base_uris = entity_tags.map((et) => et.entity_base_uri)

  log('Batch syncing tags for %d entities', entity_base_uris.length)

  for (let i = 0; i < entity_base_uris.length; i += BATCH_CHUNK_SIZE) {
    const chunk = entity_base_uris.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')

    await execute_sqlite_run({
      query: `DELETE FROM entity_tags WHERE entity_base_uri IN (${placeholders})`,
      parameters: chunk
    })
  }

  const all_tag_pairs = []
  for (const { entity_base_uri, tag_base_uris } of entity_tags) {
    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]
      for (const tag_base_uri of unique_tags) {
        all_tag_pairs.push([entity_base_uri, tag_base_uri])
      }
    }
  }

  for (let i = 0; i < all_tag_pairs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = all_tag_pairs.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?)').join(', ')
    const parameters = chunk.flat()

    await execute_sqlite_run({
      query: `INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES ${placeholders}`,
      parameters
    })
  }

  log(
    'Batch synced %d tag pairs for %d entities',
    all_tag_pairs.length,
    entity_base_uris.length
  )
}

export async function sync_entities_relations_batch({ entity_relations }) {
  if (!entity_relations || entity_relations.length === 0) return

  const source_base_uris = entity_relations.map((er) => er.source_base_uri)

  log('Batch syncing relations for %d entities', source_base_uris.length)

  for (let i = 0; i < source_base_uris.length; i += BATCH_CHUNK_SIZE) {
    const chunk = source_base_uris.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')

    await execute_sqlite_run({
      query: `DELETE FROM entity_relations WHERE source_base_uri IN (${placeholders})`,
      parameters: chunk
    })
  }

  const all_relation_tuples = []
  for (const { source_base_uri, relations } of entity_relations) {
    if (relations && relations.length > 0) {
      for (const relation of relations) {
        if (relation.target_base_uri) {
          all_relation_tuples.push([
            source_base_uri,
            relation.target_base_uri,
            relation.relation_type || 'unknown',
            relation.context || null
          ])
        }
      }
    }
  }

  for (let i = 0; i < all_relation_tuples.length; i += BATCH_CHUNK_SIZE) {
    const chunk = all_relation_tuples.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
    const parameters = chunk.flat()

    await execute_sqlite_run({
      query: `INSERT INTO entity_relations (source_base_uri, target_base_uri, relation_type, context)
              VALUES ${placeholders}
              ON CONFLICT DO UPDATE SET context = excluded.context`,
      parameters
    })
  }

  log(
    'Batch synced %d relations for %d entities',
    all_relation_tuples.length,
    source_base_uris.length
  )
}

export async function sync_entities_aliases_batch({ entity_aliases }) {
  if (!entity_aliases || entity_aliases.length === 0) return

  log('Batch syncing aliases for %d entities', entity_aliases.length)

  const prepared = []
  const all_alias_tuples = []
  const now = new Date().toISOString()

  for (const {
    entity_base_uri,
    entity_id,
    alias_base_uris
  } of entity_aliases) {
    if (!entity_base_uri) continue
    if (!entity_id) {
      if (Array.isArray(alias_base_uris) && alias_base_uris.length > 0) {
        log(
          'Skipping alias sync for %s: entity_id missing on entity with %d aliases',
          entity_base_uri,
          alias_base_uris.length
        )
      }
      continue
    }
    const unique_aliases = compute_unique_aliases({
      alias_base_uris,
      entity_base_uri
    })
    prepared.push({ entity_base_uri, entity_id, unique_aliases })
    for (const alias of unique_aliases) {
      all_alias_tuples.push([alias, entity_base_uri, entity_id, now])
    }
  }

  await with_sqlite_transaction(async () => {
    for (const { entity_base_uri, entity_id, unique_aliases } of prepared) {
      await execute_sqlite_run({
        query:
          'UPDATE entity_aliases SET current_base_uri = ? WHERE entity_id = ?',
        parameters: [entity_base_uri, entity_id]
      })

      if (unique_aliases.length > 0) {
        const placeholders = unique_aliases.map(() => '?').join(', ')
        await execute_sqlite_run({
          query: `DELETE FROM entity_aliases WHERE entity_id = ? AND alias_base_uri NOT IN (${placeholders})`,
          parameters: [entity_id, ...unique_aliases]
        })
      } else {
        await execute_sqlite_run({
          query: 'DELETE FROM entity_aliases WHERE entity_id = ?',
          parameters: [entity_id]
        })
      }
    }

    for (let i = 0; i < all_alias_tuples.length; i += BATCH_CHUNK_SIZE) {
      const chunk = all_alias_tuples.slice(i, i + BATCH_CHUNK_SIZE)
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
      const parameters = chunk.flat()

      await execute_sqlite_run({
        query: `INSERT INTO entity_aliases (alias_base_uri, current_base_uri, entity_id, recorded_at)
                VALUES ${placeholders}
                ON CONFLICT(alias_base_uri) DO UPDATE SET
                  current_base_uri = excluded.current_base_uri,
                  entity_id = excluded.entity_id`,
        parameters
      })
    }
  })

  log(
    'Batch synced %d alias rows for %d entities',
    all_alias_tuples.length,
    entity_aliases.length
  )
}

export async function sync_threads_tags_batch({ thread_tags }) {
  if (!thread_tags || thread_tags.length === 0) return

  const thread_ids = thread_tags.map((tt) => tt.thread_id)

  log('Batch syncing tags for %d threads', thread_ids.length)

  for (let i = 0; i < thread_ids.length; i += BATCH_CHUNK_SIZE) {
    const chunk = thread_ids.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')

    await execute_sqlite_run({
      query: `DELETE FROM thread_tags WHERE thread_id IN (${placeholders})`,
      parameters: chunk
    })
  }

  const all_tag_pairs = []
  for (const { thread_id, tag_base_uris } of thread_tags) {
    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]
      for (const tag_base_uri of unique_tags) {
        all_tag_pairs.push([thread_id, tag_base_uri])
      }
    }
  }

  for (let i = 0; i < all_tag_pairs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = all_tag_pairs.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?)').join(', ')
    const parameters = chunk.flat()

    await execute_sqlite_run({
      query: `INSERT INTO thread_tags (thread_id, tag_base_uri) VALUES ${placeholders}`,
      parameters
    })
  }

  log(
    'Batch synced %d tag pairs for %d threads',
    all_tag_pairs.length,
    thread_ids.length
  )
}
