/**
 * Pi Session Normalization
 *
 * Converts a Pi branch (ordered entry list extracted from the tree) into the
 * common normalized session shape consumed by the unified session import
 * pipeline. The 5-type timeline schema (message/tool_call/tool_result/
 * thinking/system) is the target format; Pi's richer entry-level types map
 * onto `system` with `system_type` discriminators.
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
  const inference_providers = new Set()
  const models = new Set()

  let running_model = null
  let running_provider = null

  // Aggregates
  let aggregate_input_tokens = 0
  let aggregate_output_tokens = 0
  let aggregate_cache_read_tokens = 0
  let aggregate_cache_write_tokens = 0
  let aggregate_input_cost = 0
  let aggregate_output_cost = 0
  let aggregate_cache_read_cost = 0
  let aggregate_cache_write_cost = 0
  let session_title = null
  const timestamps_ms = []

  for (let index = 0; index < branch_entries.length; index++) {
    const entry = branch_entries[index]
    const ts = derive_entry_timestamp(entry)
    if (ts) timestamps_ms.push(ts.getTime())

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
        continue
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
        continue
      case 'model_change': {
        // Pi v3 model_change carries fields at the top level (no `message`
        // envelope): { type, id, parentId, timestamp, modelId, provider }.
        const new_model =
          entry.modelId ?? entry.newModel ?? entry.model ?? null
        const new_provider = entry.newProvider ?? entry.provider ?? null
        const previous_model = running_model
        const previous_provider = running_provider
        if (new_model) {
          models.add(new_model)
          running_model = new_model
        }
        if (new_provider) {
          inference_providers.add(new_provider)
          running_provider = new_provider
        }
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
        continue
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
        continue
      case 'custom':
        // Extension state, not in LLM context. Skip but record once.
        log_unsupported({
          category: 'entry_types',
          value: 'custom',
          context: 'extension state, not emitted'
        })
        continue
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
        continue
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
        continue
      }
      case 'session_info':
        if (!session_title && typeof entry.title === 'string') {
          session_title = entry.title
        }
        continue
      case 'message':
        // Fall through to role-level dispatch below.
        break
      default:
        if (entry.type) {
          log_unsupported({ category: 'entry_types', value: entry.type })
        }
        // Unknown entry type -- emit as system/status so it is preserved.
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
        continue
    }

    // Role-level dispatch for entries with type='message'.
    // Pi v3 stores the role at entry.message.role (not entry.role); fall back
    // to entry.role for older shapes / migrated v1 entries.
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
        // Pi v3 nests cost inside usage.cost; older shapes had it at the top
        // level. Fall through both.
        const cost =
          entry.message?.usage?.cost ??
          entry.usage?.cost ??
          entry.message?.cost ??
          entry.cost ??
          null
        const model = entry.message?.model ?? entry.model ?? running_model
        const provider =
          entry.message?.provider ?? entry.provider ?? running_provider
        if (model) {
          models.add(model)
          running_model = model
        }
        if (provider) {
          inference_providers.add(provider)
          running_provider = provider
        }

        const per_turn = aggregate_assistant_usage_cost({ usage, cost })
        aggregate_input_tokens += per_turn.input_tokens
        aggregate_output_tokens += per_turn.output_tokens
        aggregate_cache_read_tokens += per_turn.cache_read_tokens
        aggregate_cache_write_tokens += per_turn.cache_write_tokens
        aggregate_input_cost += per_turn.input_cost
        aggregate_output_cost += per_turn.output_cost
        aggregate_cache_read_cost += per_turn.cache_read_cost
        aggregate_cache_write_cost += per_turn.cache_write_cost

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
        // Pi v3 stores toolCallId / isError / content under entry.message.
        const tool_call_id =
          entry.message?.toolCallId ??
          entry.toolCallId ??
          entry.tool_call_id
        if (!tool_call_id) {
          log(
            `normalize_pi_session: toolResult entry ${entry.id} missing toolCallId, skipping`
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
        // Role-level custom (extension-injected user-visible context). Distinct
        // from entry-level `custom` (extension state) handled above.
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

  }

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
    inference_providers: Array.from(inference_providers),
    models: Array.from(models),
    title: session_title,
    start_time,
    end_time,
    aggregate_input_tokens,
    aggregate_output_tokens,
    aggregate_cache_read_tokens,
    aggregate_cache_write_tokens,
    aggregate_input_cost,
    aggregate_output_cost,
    aggregate_cache_read_cost,
    aggregate_cache_write_cost,
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
