/**
 * SQLite Activity Queries
 *
 * CRUD operations for activity_git_daily table and thread activity aggregation.
 */

import debug from 'debug'

import {
  execute_sqlite_query,
  execute_sqlite_run
} from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:activity')

export async function query_git_activity_daily({ days = 365 } = {}) {
  log('Querying git activity for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_sqlite_query({
    query: `
      SELECT
        date,
        commits,
        lines_changed,
        files_changed
      FROM activity_git_daily
      WHERE date >= ?
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d git activity records', result.length)

  return result.map((row) => ({
    date: row.date,
    activity_git_commits: row.commits,
    activity_git_lines_changed: row.lines_changed,
    activity_git_files_changed: row.files_changed
  }))
}

export async function upsert_git_activity_daily({
  date,
  commits,
  lines_changed,
  files_changed
}) {
  log('Upserting git activity for date: %s', date)

  const updated_at = new Date().toISOString()

  await execute_sqlite_run({
    query: `
      INSERT INTO activity_git_daily (date, commits, lines_changed, files_changed, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (date) DO UPDATE SET
        commits = excluded.commits,
        lines_changed = excluded.lines_changed,
        files_changed = excluded.files_changed,
        updated_at = excluded.updated_at
    `,
    parameters: [date, commits, lines_changed, files_changed, updated_at]
  })
}

export async function upsert_git_activity_daily_batch({ entries }) {
  if (!entries || entries.length === 0) return

  log('Upserting %d git activity daily entries', entries.length)

  const updated_at = new Date().toISOString()

  const CHUNK_SIZE = 50
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')
    const parameters = chunk.flatMap((entry) => [
      entry.date,
      entry.commits ?? 0,
      entry.lines_changed ?? 0,
      entry.files_changed ?? 0,
      updated_at
    ])

    await execute_sqlite_run({
      query: `
        INSERT INTO activity_git_daily (date, commits, lines_changed, files_changed, updated_at)
        VALUES ${placeholders}
        ON CONFLICT (date) DO UPDATE SET
          commits = excluded.commits,
          lines_changed = excluded.lines_changed,
          files_changed = excluded.files_changed,
          updated_at = excluded.updated_at
      `,
      parameters
    })
  }

  log('Upserted %d git activity daily entries', entries.length)
}

export async function query_thread_activity_aggregated({ days = 365 } = {}) {
  log('Querying thread activity aggregated for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_sqlite_query({
    query: `
      SELECT
        date(created_at) as date,
        COALESCE(SUM(cumulative_input_tokens), 0) + COALESCE(SUM(cumulative_output_tokens), 0) as total_tokens,
        COALESCE(SUM(edit_count), 0) as edit_count,
        COALESCE(SUM(lines_changed), 0) as lines_changed
      FROM threads
      WHERE created_at >= ?
      GROUP BY date(created_at)
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d thread activity aggregates', result.length)

  return result.map((row) => ({
    date: row.date,
    activity_token_usage: Number(row.total_tokens) || 0,
    activity_thread_edits: Number(row.edit_count) || 0,
    activity_thread_lines_changed: Number(row.lines_changed) || 0
  }))
}

export async function query_task_activity_aggregated({ days = 365 } = {}) {
  log('Querying task activity aggregated for last %d days', days)

  const until_date = new Date()
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const since_str = since_date.toISOString().split('T')[0]
  const until_str = until_date.toISOString().split('T')[0]

  const [creation_rows, completion_rows] = await Promise.all([
    execute_sqlite_query({
      query: `
        SELECT date(created_at) as date, COUNT(*) as count
        FROM entities
        WHERE type = 'task' AND created_at >= ? AND created_at <= ?
        GROUP BY date(created_at)
      `,
      parameters: [since_str, until_str]
    }),
    // Subquery materializes type='task' filter before JSON extraction to
    // avoid json_extract running against non-task frontmatter (which can
    // cause cast errors on incompatible structures).
    execute_sqlite_query({
      query: `
        SELECT
          date(finished_at_str) as date,
          COUNT(*) as count
        FROM (
          SELECT json_extract(frontmatter, '$.finished_at') as finished_at_str
          FROM entities
          WHERE type = 'task' AND status = 'Completed'
        ) task_completions
        WHERE finished_at_str IS NOT NULL
          AND date(finished_at_str) >= ?
          AND date(finished_at_str) <= ?
        GROUP BY date(finished_at_str)
      `,
      parameters: [since_str, until_str]
    })
  ])

  const by_date = new Map()

  const coerce_date = (value) =>
    value instanceof Date
      ? value.toISOString().split('T')[0]
      : String(value).split('T')[0]

  for (const row of creation_rows) {
    const date = coerce_date(row.date)
    by_date.set(date, {
      date,
      tasks_created: Number(row.count || 0),
      tasks_completed: 0
    })
  }

  for (const row of completion_rows) {
    const date = coerce_date(row.date)
    const existing = by_date.get(date)
    if (existing) {
      existing.tasks_completed = Number(row.count || 0)
    } else {
      by_date.set(date, {
        date,
        tasks_created: 0,
        tasks_completed: Number(row.count || 0)
      })
    }
  }

  const result = Array.from(by_date.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  log('Aggregated task activity for %d days', result.length)
  return result
}

// ---------------------------------------------------------------------------
// activity_heatmap_daily table operations
// ---------------------------------------------------------------------------

export async function query_heatmap_daily_all({ days = 365 } = {}) {
  log('Querying heatmap daily cache for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_sqlite_query({
    query: `
      SELECT
        date,
        activity_git_commits,
        activity_git_lines_changed,
        activity_git_files_changed,
        activity_token_usage,
        activity_thread_edits,
        activity_thread_lines_changed,
        tasks_created,
        tasks_completed,
        score
      FROM activity_heatmap_daily
      WHERE date >= ?
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d heatmap daily rows', result.length)

  return result.map((row) => ({
    date: row.date,
    activity_git_commits: row.activity_git_commits,
    activity_git_lines_changed: row.activity_git_lines_changed,
    activity_git_files_changed: row.activity_git_files_changed,
    activity_token_usage: row.activity_token_usage,
    activity_thread_edits: row.activity_thread_edits,
    activity_thread_lines_changed: row.activity_thread_lines_changed,
    tasks_created: row.tasks_created,
    tasks_completed: row.tasks_completed,
    score: row.score
  }))
}

export async function upsert_heatmap_daily_batch({ entries }) {
  if (!entries || entries.length === 0) return

  log('Upserting %d heatmap daily entries', entries.length)

  const updated_at = new Date().toISOString()

  const CHUNK_SIZE = 50
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE)
    const placeholders = chunk
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ')
    const parameters = chunk.flatMap((entry) => [
      entry.date,
      entry.activity_git_commits ?? 0,
      entry.activity_git_lines_changed ?? 0,
      entry.activity_git_files_changed ?? 0,
      entry.activity_token_usage ?? 0,
      entry.activity_thread_edits ?? 0,
      entry.activity_thread_lines_changed ?? 0,
      entry.tasks_created ?? 0,
      entry.tasks_completed ?? 0,
      entry.score ?? 0,
      updated_at
    ])

    await execute_sqlite_run({
      query: `
        INSERT INTO activity_heatmap_daily (
          date, activity_git_commits, activity_git_lines_changed,
          activity_git_files_changed, activity_token_usage,
          activity_thread_edits, activity_thread_lines_changed,
          tasks_created, tasks_completed,
          score, updated_at
        ) VALUES ${placeholders}
        ON CONFLICT (date) DO UPDATE SET
          activity_git_commits = excluded.activity_git_commits,
          activity_git_lines_changed = excluded.activity_git_lines_changed,
          activity_git_files_changed = excluded.activity_git_files_changed,
          activity_token_usage = excluded.activity_token_usage,
          activity_thread_edits = excluded.activity_thread_edits,
          activity_thread_lines_changed = excluded.activity_thread_lines_changed,
          tasks_created = excluded.tasks_created,
          tasks_completed = excluded.tasks_completed,
          score = excluded.score,
          updated_at = excluded.updated_at
      `,
      parameters
    })
  }

  log('Upserted %d heatmap daily entries', entries.length)
}

export async function truncate_heatmap_daily() {
  await execute_sqlite_run({
    query: 'DELETE FROM activity_heatmap_daily'
  })
  log('Truncated activity_heatmap_daily table')
}

export async function get_heatmap_daily_count() {
  const result = await execute_sqlite_query({
    query: 'SELECT count(*) as cnt FROM activity_heatmap_daily'
  })

  const count = Number(result[0]?.cnt) || 0
  log('Heatmap daily row count: %d', count)
  return count
}

export async function query_entities_by_thread_activity({
  since_date,
  entity_types = null,
  limit = 50,
  offset = 0
}) {
  const types_array = entity_types
    ? Array.isArray(entity_types)
      ? entity_types
      : [entity_types]
    : null

  log(
    'Querying entities by thread activity since %s (types: %s)',
    since_date?.toISOString(),
    types_array?.join(', ') || 'all'
  )

  const limit_int = Math.max(0, Math.floor(Number(limit) || 50))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const where_clauses = ["er.source_base_uri LIKE 'user:thread/%'"]
  const parameters = []

  if (since_date) {
    where_clauses.push('t.updated_at >= ?')
    parameters.push(since_date.toISOString())
  }

  if (types_array && types_array.length > 0) {
    const placeholders = types_array.map(() => '?').join(', ')
    where_clauses.push(`e.type IN (${placeholders})`)
    parameters.push(...types_array)
  }

  parameters.push(limit_int, offset_int)

  const query = `
    SELECT
      e.base_uri,
      e.entity_id,
      e.type,
      e.title,
      e.status,
      e.priority,
      COUNT(DISTINCT t.thread_id) as thread_count,
      MAX(t.updated_at) as last_activity
    FROM entities e
    JOIN entity_relations er ON er.target_base_uri = e.base_uri
    JOIN threads t ON er.source_base_uri = 'user:thread/' || t.thread_id
    WHERE ${where_clauses.join(' AND ')}
    GROUP BY e.base_uri, e.entity_id, e.type, e.title, e.status, e.priority
    ORDER BY last_activity DESC
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_sqlite_query({ query, parameters })

    log('Found %d entities with thread activity', rows.length)
    return rows.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      status: row.status,
      priority: row.priority,
      thread_count: Number(row.thread_count) || 0,
      last_activity: row.last_activity
    }))
  } catch (error) {
    log('Error querying entities by thread activity: %s', error.message)
    throw error
  }
}

export async function query_tasks_from_entities({ archived = false } = {}) {
  log('Querying tasks from entities, archived=%s', archived)

  const result = await execute_sqlite_query({
    query: `
      SELECT
        base_uri,
        entity_id,
        title,
        description,
        status,
        priority,
        archived,
        user_public_key,
        created_at,
        updated_at,
        frontmatter
      FROM entities
      WHERE type = 'task'
        AND archived = ?
      ORDER BY updated_at DESC
    `,
    parameters: [archived ? 1 : 0]
  })

  log('Retrieved %d tasks', result.length)

  return result.map((row) => {
    const frontmatter =
      typeof row.frontmatter === 'string'
        ? JSON.parse(row.frontmatter)
        : row.frontmatter || {}

    return {
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      archived: row.archived,
      user_public_key: row.user_public_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...frontmatter
    }
  })
}
