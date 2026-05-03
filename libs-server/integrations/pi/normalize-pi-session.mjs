/**
 * Pi Session Normalization
 *
 * Converts a Pi branch (ordered entry list extracted from the tree) into the
 * common normalized session shape consumed by the unified session import
 * pipeline. The 5-type timeline schema (message/tool_call/tool_result/
 * thinking/system) is the target format; Pi's richer entry-level types map
 * onto `system` with `system_type` discriminators.
 *
 * Pi session spec (canonical reference for field shapes used below):
 *   https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/session-format.md
 *
 * Pi v3 wraps message fields under entry.message:
 *   { type: 'message', id, parentId, timestamp,
 *     message: { role, content, model?, provider?, toolCallId?, isError?,
 *                usage?: { input, output, cacheRead, cacheWrite, totalTokens,
 *                          cost: { input, output, cacheRead, cacheWrite, total } } } }
 * Non-message entry types (model_change, thinking_level_change, compaction,
 * etc.) carry their fields at the top level (no `message` envelope).
 *
 * Build-timeline-entries.mjs handles entry serialization, schema_version
 * stamping, and provenance assertion -- this normalizer only emits the
 * provider-neutral message objects.
 */

import debug from 'debug'

import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'

const log = debug('integrations:pi:normalize')

const UNSUPPORTED_TRACKING = {
  entry_types: new Set(),
  message_roles: new Set(),
  content_types: new Set()
}

const log_unsupported = ({ category, value, context = '' }) => {
  if (!UNSUPPORTED_TRACKING[category].has(value)) {
    UNSUPPORTED_TRACKING[category].add(value)
    log(
      `UNSUPPORTED ${category.toUpperCase()}: ${value}${context ? ` (${context})` : ''}`
    )
  }
}

export const get_unsupported_summary = () => ({
  entry_types: Array.from(UNSUPPORTED_TRACKING.entry_types),
  message_roles: Array.from(UNSUPPORTED_TRACKING.message_roles),
  content_types: Array.from(UNSUPPORTED_TRACKING.content_types)
})

export const clear_unsupported_tracking = () => {
  UNSUPPORTED_TRACKING.entry_types.clear()
  UNSUPPORTED_TRACKING.message_roles.clear()
  UNSUPPORTED_TRACKING.content_types.clear()
}

/**
 * Compute the per-branch session_id used for deterministic thread ID
 * derivation. Sibling branches from the same Pi file get distinct
 * session_ids so every branch becomes a distinct thread.
 */
export const compose_pi_branch_session_id = ({ header_id, branch_index }) =>
  `${header_id}-branch-${branch_index}`

/**
 * Normalize a Pi branch. Input is the raw Pi session-shape produced by
 * pi-session-provider.find_sessions/stream_sessions:
 *
 *   {
 *     header,             // parsed Pi session header (id, version, ...)
 *     branch_entries,     // entries for this specific branch (root -> leaf)
 *     entries,            // alias to branch_entries (is_warm_session guard)
 *     branch_index,
 *     total_branches,
 *     branch_points,      // [{entry_id, child_ids}]
 *     all_branch_session_ids,
 *     parent_session_path,// from header.parentSession (optional)
 *     project_path,       // decoded from sessions dir
 *     session_id          // composed branched id
 *   }
 */
/**
 * Normalize a single Pi entry into zero or more 5-type timeline messages.
 *
 * Pure: depends only on its inputs. Returns the new messages plus the
 * running model/provider after this entry, the timestamp_ms (or null),
 * and an optional session_title_candidate that the session-level fold
 * may capture if it is the first one seen.
 *
 * The session-level fold (`normalize_pi_session`) sequences calls to
 * this primitive and derives session aggregates via
 * `compute_pi_session_aggregates(messages)`. The delta importer reuses
 * the same primitive for newly appended Pi entries.
 */
export const normalize_pi_entry = ({
  entry,
  index,
  branch_index,
  thread_id,
  running_model = null,
  running_provider = null
}) => {
  const ts = derive_entry_timestamp(entry)
  const provider_data = {
    pi_entry_id: entry.id,
    pi_parent_id: entry.parentId ?? null,
    branch_index,
    sequence_index: index
  }

  // build-timeline-entries.mjs:base_entry stamps schema_version and
  // PROVENANCE.SESSION_IMPORT on the emitted entry. Anything outside the
  // known_message_keys whitelist there is logged as unsupported metadata,
  // so we keep this object lean.
  const base = {
    id: `pi-${thread_id}-${entry.id}-${index}`,
    timestamp: ts,
    provider_data,
    ordering: {
      sequence: index,
      source_uuid: String(entry.id ?? ''),
      parent_id: entry.parentId ?? null
    }
  }

  const messages = []
  let next_running_model = running_model
  let next_running_provider = running_provider
  let session_title_candidate = null

  // Top-level entry-type dispatch FIRST. The plan requires that an
  // entry-level `branch_summary` type takes precedence over a
  // role-level `branchSummary` -- both produce the same system entry, but
  // the precedence is documented to avoid silent duplication.
  switch (entry.type) {
    case 'compaction':
      messages.push({
        ...base,
        type: 'system',
        system_type: 'compaction',
        content: extract_summary_text(entry),
        metadata: {
          tokens_before: entry.tokensBefore ?? null,
          first_kept_entry_id: entry.firstKeptEntryId ?? null
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    case 'branch_summary':
      messages.push({
        ...base,
        type: 'system',
        system_type: 'branch_point',
        content: extract_summary_text(entry),
        metadata: {
          source_entry_id: entry.sourceEntryId ?? entry.parentId ?? null
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    case 'model_change': {
      const new_model = entry.modelId ?? entry.newModel ?? entry.model ?? null
      const new_provider = entry.newProvider ?? entry.provider ?? null
      const previous_model = next_running_model
      const previous_provider = next_running_provider
      if (new_model) next_running_model = new_model
      if (new_provider) next_running_provider = new_provider
      messages.push({
        ...base,
        type: 'system',
        system_type: 'configuration',
        content: `Model changed to ${new_model ?? 'unknown'}`,
        metadata: {
          new_model,
          previous_model,
          new_provider,
          previous_provider
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    }
    case 'thinking_level_change':
      messages.push({
        ...base,
        type: 'system',
        system_type: 'configuration',
        content: `Thinking level changed to ${entry.thinkingLevel ?? 'unknown'}`,
        metadata: {
          thinking_level: entry.thinkingLevel ?? null
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    case 'custom':
      // Extension state, not in LLM context. Skip but record once.
      log_unsupported({
        category: 'entry_types',
        value: 'custom',
        context: 'extension state, not emitted'
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    case 'custom_message': {
      messages.push({
        ...base,
        type: 'message',
        role: 'system',
        content: extract_text_content(entry.content ?? entry.message?.content ?? ''),
        metadata: {
          extension_type: entry.extensionType ?? null,
          display: entry.display ?? null
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    }
    case 'label': {
      const label_text = entry.label ?? entry.text ?? ''
      messages.push({
        ...base,
        type: 'system',
        system_type: 'status',
        content: label_text || 'label',
        metadata: {
          extension_type: 'pi_label',
          label_text
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    }
    case 'session_info':
      if (typeof entry.title === 'string') session_title_candidate = entry.title
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
    case 'message':
      // Fall through to role-level dispatch below.
      break
    default:
      if (entry.type) {
        log_unsupported({ category: 'entry_types', value: entry.type })
      }
      messages.push({
        ...base,
        type: 'system',
        system_type: 'status',
        content: `Unsupported Pi entry type: ${entry.type}`,
        metadata: {
          original_type: entry.type,
          unsupported_entry: true
        }
      })
      return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
  }

  // Role-level dispatch for entries with type='message'.
  const role = entry.message?.role ?? entry.role
  switch (role) {
    case 'user': {
      messages.push({
        ...base,
        type: 'message',
        role: 'user',
        content: extract_text_content(
          entry.message?.content ?? entry.content ?? ''
        ),
        metadata: {}
      })
      break
    }
    case 'assistant': {
      const blocks = extract_assistant_blocks(entry)
      const usage = entry.message?.usage ?? entry.usage ?? null
      const cost =
        entry.message?.usage?.cost ??
        entry.usage?.cost ??
        entry.message?.cost ??
        entry.cost ??
        null
      const model = entry.message?.model ?? entry.model ?? next_running_model
      const provider =
        entry.message?.provider ?? entry.provider ?? next_running_provider
      if (model) next_running_model = model
      if (provider) next_running_provider = provider

      const per_turn = aggregate_assistant_usage_cost({ usage, cost })
      const text_content = blocks.text_pieces.join('').trim()
      if (text_content || blocks.thinking_blocks.length === 0) {
        messages.push({
          ...base,
          type: 'message',
          role: 'assistant',
          content: text_content || '',
          metadata: {
            model,
            provider,
            ...per_turn
          }
        })
      }

      for (let bi = 0; bi < blocks.thinking_blocks.length; bi++) {
        const block = blocks.thinking_blocks[bi]
        messages.push({
          ...base,
          id: `${base.id}-thinking-${bi}`,
          type: 'thinking',
          thinking_type: 'reasoning',
          content: block.content,
          metadata: {}
        })
      }

      for (let ti = 0; ti < blocks.tool_calls.length; ti++) {
        const tc = blocks.tool_calls[ti]
        messages.push({
          ...base,
          id: `${base.id}-tool-call-${ti}`,
          type: 'tool_call',
          content: {
            tool_name: tc.tool_name,
            tool_parameters: tc.tool_parameters || {},
            tool_call_id: tc.tool_call_id,
            execution_status: 'pending'
          },
          metadata: {}
        })
      }
      break
    }
    case 'toolResult': {
      const tool_call_id =
        entry.message?.toolCallId ??
        entry.toolCallId ??
        entry.tool_call_id
      if (!tool_call_id) {
        log(
          `normalize_pi_entry: toolResult entry ${entry.id} missing toolCallId, skipping`
        )
        break
      }
      const is_error = !!(entry.message?.isError ?? entry.isError)
      const raw_content =
        entry.message?.content ?? entry.content ?? entry.result ?? null
      const result_content = extract_text_content(raw_content) || raw_content
      messages.push({
        ...base,
        type: 'tool_result',
        content: {
          tool_call_id,
          result: is_error ? null : result_content,
          error: is_error ? result_content : null
        },
        metadata: {}
      })
      break
    }
    case 'bashExecution': {
      const command =
        entry.command ?? entry.content?.command ?? entry.message?.command ?? ''
      const tool_call_id = `pi-bash-${entry.id}`
      messages.push({
        ...base,
        id: `${base.id}-bash-call`,
        type: 'tool_call',
        content: {
          tool_name: 'bash',
          tool_parameters: { command },
          tool_call_id,
          execution_status: 'pending'
        },
        metadata: {}
      })
      messages.push({
        ...base,
        id: `${base.id}-bash-result`,
        type: 'tool_result',
        content: {
          tool_call_id,
          result: entry.output ?? entry.stdout ?? null,
          error: entry.error ?? entry.stderr ?? null
        },
        provider_data: {
          ...provider_data,
          exit_code: entry.exitCode ?? null,
          cancelled: entry.cancelled ?? false,
          truncated: entry.truncated ?? false,
          full_output_path: entry.fullOutputPath ?? null
        },
        metadata: {}
      })
      break
    }
    case 'custom': {
      messages.push({
        ...base,
        type: 'message',
        role: 'system',
        content: extract_text_content(
          entry.content ?? entry.message?.content ?? ''
        ),
        metadata: {
          extension_type: entry.extensionType ?? null
        }
      })
      break
    }
    case 'branchSummary': {
      messages.push({
        ...base,
        type: 'system',
        system_type: 'branch_point',
        content: extract_summary_text(entry),
        metadata: {
          source_entry_id: entry.sourceEntryId ?? entry.parentId ?? null
        }
      })
      break
    }
    case 'compactionSummary': {
      messages.push({
        ...base,
        type: 'system',
        system_type: 'compaction',
        content: extract_summary_text(entry),
        metadata: {}
      })
      break
    }
    default:
      if (role) log_unsupported({ category: 'message_roles', value: role })
      messages.push({
        ...base,
        type: 'system',
        system_type: 'status',
        content: `Unsupported Pi message role: ${role}`,
        metadata: {
          unsupported_role: role
        }
      })
  }

  return finalize(messages, ts, next_running_model, next_running_provider, session_title_candidate)
}

const finalize = (messages, ts, next_running_model, next_running_provider, session_title_candidate) => ({
  messages,
  next_running_model,
  next_running_provider,
  session_title_candidate,
  timestamp_ms: ts ? ts.getTime() : null
})

/**
 * Aggregate session-level totals as a pure function of the message set.
 * Both the batch path (full normalization) and the delta path (post-merge
 * normalized message set) call this; identity of inputs guarantees identity
 * of outputs, which is what makes fall-through-on-error safe.
 */
export const compute_pi_session_aggregates = (messages) => {
  let aggregate_input_tokens = 0
  let aggregate_output_tokens = 0
  let aggregate_cache_read_tokens = 0
  let aggregate_cache_write_tokens = 0
  let aggregate_input_cost = 0
  let aggregate_output_cost = 0
  let aggregate_cache_read_cost = 0
  let aggregate_cache_write_cost = 0
  const models = new Set()
  const inference_providers = new Set()

  for (const m of messages) {
    if (m.type === 'message' && m.role === 'assistant') {
      const md = m.metadata || {}
      aggregate_input_tokens += Number(md.input_tokens || 0)
      aggregate_output_tokens += Number(md.output_tokens || 0)
      aggregate_cache_read_tokens += Number(md.cache_read_tokens || 0)
      aggregate_cache_write_tokens += Number(md.cache_write_tokens || 0)
      aggregate_input_cost += Number(md.input_cost || 0)
      aggregate_output_cost += Number(md.output_cost || 0)
      aggregate_cache_read_cost += Number(md.cache_read_cost || 0)
      aggregate_cache_write_cost += Number(md.cache_write_cost || 0)
      if (md.model) models.add(md.model)
      if (md.provider) inference_providers.add(md.provider)
    } else if (m.type === 'system' && m.system_type === 'configuration') {
      const md = m.metadata || {}
      if (md.new_model) models.add(md.new_model)
      if (md.new_provider) inference_providers.add(md.new_provider)
    }
  }

  return {
    aggregate_input_tokens,
    aggregate_output_tokens,
    aggregate_cache_read_tokens,
    aggregate_cache_write_tokens,
    aggregate_input_cost,
    aggregate_output_cost,
    aggregate_cache_read_cost,
    aggregate_cache_write_cost,
    models: Array.from(models),
    inference_providers: Array.from(inference_providers)
  }
}

export const normalize_pi_session = (raw_session) => {
  const {
    header,
    branch_entries = [],
    branch_index = 0,
    total_branches = 1,
    all_branch_session_ids = [],
    parent_session_path = null,
    project_path = null,
    session_id
  } = raw_session

  if (!header || !session_id) {
    throw new Error(
      'normalize_pi_session: raw_session missing header or session_id'
    )
  }

  const thread_id = generate_thread_id_from_session({
    session_id,
    session_provider: 'pi'
  })

  const messages = []
  let running_model = null
  let running_provider = null
  let session_title = null
  const timestamps_ms = []

  for (let index = 0; index < branch_entries.length; index++) {
    const result = normalize_pi_entry({
      entry: branch_entries[index],
      index,
      branch_index,
      thread_id,
      running_model,
      running_provider
    })
    for (const m of result.messages) messages.push(m)
    running_model = result.next_running_model
    running_provider = result.next_running_provider
    if (!session_title && result.session_title_candidate) {
      session_title = result.session_title_candidate
    }
    if (result.timestamp_ms != null) timestamps_ms.push(result.timestamp_ms)
  }

  const aggregates = compute_pi_session_aggregates(messages)

  const start_time =
    timestamps_ms.length > 0 ? new Date(Math.min(...timestamps_ms)) : null
  const end_time =
    timestamps_ms.length > 0 ? new Date(Math.max(...timestamps_ms)) : null

  const metadata = {
    branch_index,
    total_branches,
    sibling_session_ids: all_branch_session_ids.filter(
      (sid) => sid !== session_id
    ),
    original_session_id: header.id,
    parent_session_path,
    project_path,
    inference_providers: aggregates.inference_providers,
    models: aggregates.models,
    title: session_title,
    start_time,
    end_time,
    aggregate_input_tokens: aggregates.aggregate_input_tokens,
    aggregate_output_tokens: aggregates.aggregate_output_tokens,
    aggregate_cache_read_tokens: aggregates.aggregate_cache_read_tokens,
    aggregate_cache_write_tokens: aggregates.aggregate_cache_write_tokens,
    aggregate_input_cost: aggregates.aggregate_input_cost,
    aggregate_output_cost: aggregates.aggregate_output_cost,
    aggregate_cache_read_cost: aggregates.aggregate_cache_read_cost,
    aggregate_cache_write_cost: aggregates.aggregate_cache_write_cost,
    pi_header_version: header.version
  }

  return {
    session_id,
    session_provider: 'pi',
    messages,
    metadata,
    parse_mode: 'full'
  }
}

const derive_entry_timestamp = (entry) => {
  const candidate =
    entry?.timestamp ??
    entry?.message?.timestamp ??
    entry?.createdAt ??
    null
  if (candidate == null) return null
  if (typeof candidate === 'number') return new Date(candidate)
  const d = new Date(candidate)
  return isNaN(d.getTime()) ? null : d
}

const extract_text_content = (content) => {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text') return item.text || item.content || ''
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  if (typeof content === 'object' && content.text) return content.text
  return ''
}

const extract_summary_text = (entry) => {
  const v =
    entry.summary ??
    entry.content ??
    entry.message?.content ??
    entry.text ??
    ''
  return typeof v === 'string' ? v : extract_text_content(v) || ''
}

const extract_assistant_blocks = (entry) => {
  const text_pieces = []
  const thinking_blocks = []
  const tool_calls = []
  const content =
    entry.content ?? entry.message?.content ?? entry.blocks ?? ''

  if (typeof content === 'string') {
    text_pieces.push(content)
    return { text_pieces, thinking_blocks, tool_calls }
  }

  if (!Array.isArray(content)) {
    return { text_pieces, thinking_blocks, tool_calls }
  }

  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const type = block.type
    switch (type) {
      case 'text':
        text_pieces.push(block.text || block.content || '')
        break
      case 'thinking':
        thinking_blocks.push({
          content: block.thinking || block.text || block.content || ''
        })
        break
      case 'toolCall':
      case 'tool_use':
      case 'tool_call':
        tool_calls.push({
          tool_name: block.name || block.tool_name || 'unknown',
          tool_parameters: block.arguments || block.input || block.parameters || {},
          tool_call_id: block.id || block.tool_call_id || `pi-tool-${entry.id}`
        })
        break
      default:
        log_unsupported({
          category: 'content_types',
          value: type || 'unknown',
          context: 'assistant content block'
        })
    }
  }

  return { text_pieces, thinking_blocks, tool_calls }
}

// Pi v3 usage shape: { input, output, cacheRead, cacheWrite, totalTokens,
// cost: { input, output, cacheRead, cacheWrite } }. Older / hand-written
// shapes used inputTokens/outputTokens with cost at the top level using
// inputCost/outputCost. Read both.
const aggregate_assistant_usage_cost = ({ usage, cost }) => {
  const u = usage || {}
  const c = cost || {}
  return {
    input_tokens:
      Number(u.input ?? u.inputTokens ?? u.input_tokens ?? 0) || 0,
    output_tokens:
      Number(u.output ?? u.outputTokens ?? u.output_tokens ?? 0) || 0,
    cache_read_tokens:
      Number(u.cacheRead ?? u.cacheReadTokens ?? u.cache_read_tokens ?? 0) ||
      0,
    cache_write_tokens:
      Number(
        u.cacheWrite ?? u.cacheWriteTokens ?? u.cache_write_tokens ?? 0
      ) || 0,
    input_cost: Number(c.input ?? c.inputCost ?? c.input_cost ?? 0) || 0,
    output_cost: Number(c.output ?? c.outputCost ?? c.output_cost ?? 0) || 0,
    cache_read_cost:
      Number(c.cacheRead ?? c.cacheReadCost ?? c.cache_read_cost ?? 0) || 0,
    cache_write_cost:
      Number(c.cacheWrite ?? c.cacheWriteCost ?? c.cache_write_cost ?? 0) || 0
  }
}
