#!/usr/bin/env bun
/**
 * Live session-lifecycle monitor.
 *
 * Connects to the Base WebSocket, streams every THREAD_* / ACTIVE_SESSION_*
 * event with timestamps, and optionally drives a create-session or resume to
 * reproduce the full lifecycle. Useful for reproducing ordering/race bugs
 * between create-session, WebSocket events, sync-hook imports, and the
 * thread-timeline UI.
 *
 * Usage:
 *   bun scripts/monitor-session-lifecycle.mjs \
 *     --host https://base.tint.space \
 *     --token <JWT> \
 *     [--create "<prompt>" --cwd user:]       # submit a new session
 *     [--resume <thread_id> "<prompt>"]       # resume an existing thread
 *     [--watch <thread_id>]                   # subscribe to a thread timeline
 *     [--duration 60]                         # seconds to stay connected (default 120)
 *
 * Env fallbacks: BASE_HOST, BASE_TOKEN.
 */
import WebSocket from 'ws'

const args = process.argv.slice(2)
const get_arg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const has_flag = (flag) => args.includes(flag)

const host = get_arg('--host') || process.env.BASE_HOST
const token = get_arg('--token') || process.env.BASE_TOKEN
const create_prompt = get_arg('--create')
const cwd = get_arg('--cwd') || 'user:'
const resume_thread_id = get_arg('--resume')
const resume_prompt = resume_thread_id ? args[args.indexOf('--resume') + 2] : null
const watch_thread_id = get_arg('--watch')
const duration_s = parseInt(get_arg('--duration') || '120', 10)

if (!host || !token) {
  console.error('Missing --host or --token (or BASE_HOST/BASE_TOKEN)')
  process.exit(1)
}
if (has_flag('--help') || has_flag('-h')) {
  console.error(
    [
      'Usage:',
      '  monitor-session-lifecycle.mjs --host <https-url> --token <jwt> [options]',
      '',
      'Options:',
      '  --create "<prompt>" [--cwd <dir>]   Submit POST /api/threads/create-session',
      '  --resume <thread_id> "<prompt>"     Submit POST /api/threads/:id/resume',
      '  --watch <thread_id>                 Subscribe to thread timeline events',
      '  --duration <seconds>                Connection lifetime (default 120)'
    ].join('\n')
  )
  process.exit(0)
}

const ts = () => new Date().toISOString().split('T')[1].replace('Z', '')
const log = (tag, ...rest) => console.log(`[${ts()}] ${tag}`, ...rest)

const ws_url = `${host.replace(/^http/, 'ws')}/?token=${encodeURIComponent(token)}`
const ws = new WebSocket(ws_url)

let watched_thread_id = watch_thread_id || resume_thread_id || null

let truncated_entry_count = 0
let full_entry_count = 0

const summarize_event = (msg) => {
  const p = msg.payload || {}
  const thread = p.thread || {}
  const session = p.session || {}
  const fields = {
    thread_id: p.thread_id || thread.thread_id || session.thread_id || null,
    session_id: p.session_id || session.session_id || null,
    job_id: p.job_id || null,
    session_status: thread.session_status || session.status || null,
    entry: p.entry
      ? {
          id: p.entry.id,
          type: p.entry.type,
          role: p.entry.role,
          truncated: !!p.entry.truncated,
          content_preview:
            typeof p.entry.content === 'string'
              ? p.entry.content.slice(0, 60)
              : p.entry.type
        }
      : null,
    error_message: p.error_message || null
  }
  return fields
}

ws.on('open', async () => {
  log('WS', 'connected')

  if (watched_thread_id) {
    ws.send(
      JSON.stringify({
        type: 'SUBSCRIBE_THREAD',
        payload: { thread_id: watched_thread_id }
      })
    )
    log('WS', `SUBSCRIBE_THREAD ${watched_thread_id}`)
  }

  if (create_prompt) {
    log('HTTP', `POST /api/threads/create-session (prompt=${JSON.stringify(create_prompt.slice(0, 40))})`)
    const t0 = Date.now()
    const res = await fetch(`${host}/api/threads/create-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prompt: create_prompt, working_directory: cwd })
    })
    const body = await res.json().catch(() => ({}))
    log('HTTP', `create-session ${res.status} in ${Date.now() - t0}ms`, body)
    if (body.thread_id) {
      watched_thread_id = body.thread_id
      ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE_THREAD',
          payload: { thread_id: watched_thread_id }
        })
      )
      log('WS', `SUBSCRIBE_THREAD ${watched_thread_id}`)
    }
  }

  if (resume_thread_id && resume_prompt) {
    log('HTTP', `POST /api/threads/${resume_thread_id}/resume`)
    const t0 = Date.now()
    const res = await fetch(
      `${host}/api/threads/${resume_thread_id}/resume`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: resume_prompt, working_directory: cwd })
      }
    )
    const body = await res.json().catch(() => ({}))
    log('HTTP', `resume ${res.status} in ${Date.now() - t0}ms`, body)
  }
})

ws.on('message', (data) => {
  let msg
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return
  }
  if (
    !msg.type ||
    !(msg.type.startsWith('THREAD_') || msg.type.startsWith('ACTIVE_SESSION_'))
  ) {
    return
  }
  if (
    msg.type === 'THREAD_TIMELINE_ENTRY_ADDED' &&
    (!watched_thread_id ||
      msg.payload?.thread_id === watched_thread_id)
  ) {
    if (msg.payload?.entry?.truncated) truncated_entry_count += 1
    else full_entry_count += 1
  }
  log('EVT', msg.type, summarize_event(msg))
})

ws.on('close', () => {
  log('WS', 'closed')
})

ws.on('error', (err) => {
  log('WS', 'error', err.message)
})

setTimeout(() => {
  log('WS', `closing after ${duration_s}s`)
  log(
    'SUMMARY',
    `THREAD_TIMELINE_ENTRY_ADDED for ${watched_thread_id || '<any>'}: full=${full_entry_count} truncated=${truncated_entry_count}`
  )
  ws.close()
  setTimeout(() => process.exit(0), 500)
}, duration_s * 1000)
