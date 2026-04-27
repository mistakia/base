import React, { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useSelector } from 'react-redux'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { COLORS } from '@theme/colors.js'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'
import '@styles/chip.styl'
import { get_thread_cost_display } from '@core/threads/selectors'
import { get_app } from '@core/app/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay,
  ThreadStateField,
  ModelsField,
  CollapsibleFileReferences
} from '@views/components/MetadataDisplay'
import RelatedEntities from '@views/components/RelatedEntities'
import SessionActivityBar from '@components/SessionActivityBar/SessionActivityBar.js'
import { EditableTagsField } from '@views/components/InlineSelect'
import {
  extract_message_counts,
  extract_tool_call_count,
  extract_duration,
  extract_working_directory,
  extract_thread_state,
  extract_thread_title,
  extract_thread_description,
  extract_user_public_key,
  extract_tags
} from '@views/utils/thread-metadata-extractor.js'
import { parse_relations_for_display } from '#libs-shared/relation-parser.mjs'
import { SESSION_STATUS_DISPLAY_MAP } from '#libs-shared/session-status-display.mjs'

const SPACING = {
  TITLE_MARGIN: '8px',
  DESCRIPTION_MARGIN: '16px'
}
const HEADER_STYLES = {
  TEXT_LIGHT: COLORS.text_tertiary,
  TEXT_MEDIUM: COLORS.text_secondary,
  TEXT_DARK: COLORS.text,
  BG_HOVER: COLORS.surface_hover,
  BG_ACTIVE: COLORS.border_light
}

const extract_models = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return []
  }
  // Top-level `models` is an Immutable List; empty lists are truthy, so fall
  // back to the provider_metadata copy whenever the top-level list has zero
  // entries. This mirrors how older Claude imports left the top-level array
  // unpopulated while writing the model name into provider_metadata.models.
  const top_level = metadata.get('models')
  const top_level_size =
    top_level && (top_level.size ?? top_level.length ?? 0)
  if (top_level_size > 0) return top_level
  return (
    metadata.getIn(['external_session', 'provider_metadata', 'models']) || []
  )
}

const extract_source_info = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return null
  }

  const external_session = metadata.get('external_session')
  if (!external_session) return null

  const session_provider =
    external_session.get?.('provider') || external_session.provider
  const session_id =
    external_session.get?.('session_id') || external_session.session_id
  const provider_metadata =
    external_session.get?.('provider_metadata') ||
    external_session.provider_metadata
  const working_directory =
    provider_metadata?.get?.('working_directory') ||
    provider_metadata?.working_directory

  return {
    provider: session_provider,
    session_id,
    working_directory
  }
}

const extract_dates = (metadata) => {
  if (!metadata || !metadata.get) {
    return { created_at: null, updated_at: null }
  }

  const created_at = metadata.get('created_at') || null
  const updated_at = metadata.get('updated_at') || null

  return { created_at, updated_at }
}

const extract_execution = (metadata) => {
  if (!metadata || !metadata.get) return null
  const execution = metadata.get('execution')
  if (!execution) return null
  const get = (key) => execution.get?.(key) ?? execution[key] ?? null
  return {
    mode: get('mode'),
    machine_id: get('machine_id'),
    container_runtime: get('container_runtime'),
    container_name: get('container_name')
  }
}

const extract_inference_provider = (metadata) =>
  metadata?.get?.('inference_provider') || null

const extract_git_branch = (metadata) =>
  metadata?.get?.('git_branch') || null

const extract_relations = (metadata) => {
  if (!metadata || !metadata.get) {
    return []
  }

  const relations = metadata.get('relations')
  if (!relations) return []

  // Handle Immutable.js List - convert to plain array
  return relations.toJS ? relations.toJS() : relations
}

// Custom hook for metadata processing -- memoized to avoid re-extracting
// on every render when only unrelated selectors (e.g. active_session) change
const use_thread_metadata = (metadata) => {
  return useMemo(() => {
    const dates = extract_dates(metadata)
    const message_counts = extract_message_counts(metadata)
    const tool_call_count = extract_tool_call_count(metadata)
    const duration = extract_duration(metadata)
    const working_directory = extract_working_directory(metadata)
    const thread_state = extract_thread_state(metadata)
    const title = extract_thread_title(metadata)
    const description = extract_thread_description(metadata)
    const thread_user_public_key = extract_user_public_key(metadata)
    const relations = extract_relations(metadata)
    const tags = extract_tags(metadata)
    const execution = extract_execution(metadata)
    const inference_provider = extract_inference_provider(metadata)
    const git_branch = extract_git_branch(metadata)

    return {
      title,
      description,
      duration,
      models: extract_models(metadata),
      source_info: extract_source_info(metadata),
      execution,
      inference_provider,
      git_branch,
      thread_state,
      created_at: dates.created_at,
      updated_at: dates.updated_at,
      message_count: message_counts.message_count,
      user_message_count: message_counts.user_message_count,
      assistant_message_count: message_counts.assistant_message_count,
      tool_call_count,
      working_directory: working_directory.path,
      working_directory_formatted: working_directory.formatted,
      thread_user_public_key,
      relations,
      tags
    }
  }, [metadata])
}

// Sub-components for better organization
const ThreadTitle = ({ title, description, working_directory_formatted }) => {
  if (!title) return null

  const has_content_below = description || working_directory_formatted
  const title_margin_bottom = has_content_below
    ? SPACING.TITLE_MARGIN
    : SPACING.DESCRIPTION_MARGIN

  const description_margin_bottom = working_directory_formatted
    ? SPACING.TITLE_MARGIN
    : SPACING.DESCRIPTION_MARGIN

  return (
    <div>
      <h5
        style={{
          marginBottom: title_margin_bottom,
          fontWeight: 'bold',
          fontSize: '20px',
          margin: 0,
          lineHeight: '1.2'
        }}>
        {title}
      </h5>
      {description && (
        <p
          style={{
            margin: `0 0 ${description_margin_bottom} 0`,
            fontSize: '14px',
            color: HEADER_STYLES.TEXT_MEDIUM,
            lineHeight: '1.4'
          }}>
          {description}
        </p>
      )}
      {working_directory_formatted && working_directory_formatted !== title && (
        <p
          style={{
            margin: `0 0 ${SPACING.DESCRIPTION_MARGIN} 0`,
            fontSize: '12px',
            color: HEADER_STYLES.TEXT_LIGHT,
            fontFamily: 'monospace',
            backgroundColor: HEADER_STYLES.BG_HOVER,
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'inline-block'
          }}>
          {working_directory_formatted}
        </p>
      )}
    </div>
  )
}

ThreadTitle.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  working_directory_formatted: PropTypes.string
}

// Styles for ExternalSessionIdDisplay
const SESSION_ID_STYLES = {
  container: {
    fontSize: '12px',
    color: HEADER_STYLES.TEXT_LIGHT,
    fontFamily: 'monospace',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    position: 'relative',
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: HEADER_STYLES.BG_HOVER,
      color: HEADER_STYLES.TEXT_DARK
    },
    '&:active': {
      backgroundColor: HEADER_STYLES.BG_ACTIVE
    }
  },
  icon_wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    fontSize: '10px',
    opacity: 0.6,
    transition: 'opacity 0.2s ease',
    '&:hover': {
      opacity: 1
    }
  }
}

const ExternalSessionIdDisplay = ({ session_id }) => {
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const is_copied = copied_value === session_id

  return (
    <Box
      onClick={() => copy_to_clipboard(session_id)}
      sx={SESSION_ID_STYLES.container}>
      <span>{session_id}</span>
      <Box sx={SESSION_ID_STYLES.icon_wrapper}>
        {is_copied ? (
          <CheckIcon sx={{ fontSize: '12px' }} />
        ) : (
          <ContentCopyOutlinedIcon sx={{ fontSize: '10px' }} />
        )}
      </Box>
    </Box>
  )
}

ExternalSessionIdDisplay.propTypes = {
  session_id: PropTypes.string.isRequired
}

// Helper to determine if a metadata row should be marked as first
const use_first_row_tracker = () => {
  let has_rendered_row = false

  return () => {
    if (has_rendered_row) {
      return false
    }
    has_rendered_row = true
    return true
  }
}

const CHANGE_RELATION_TYPES = new Set(['creates', 'modifies'])


const ThreadStats = ({
  session_id,
  duration,
  models,
  source_info,
  created_at,
  updated_at,
  message_count,
  user_message_count,
  assistant_message_count,
  tool_call_count,
  thread_cost_display,
  thread_id,
  relations,
  tags,
  execution,
  inference_provider,
  git_branch
}) => {
  const working_directory = source_info?.working_directory
  const session_provider = source_info?.provider
  const has_dates = created_at || updated_at
  const has_message_breakdown =
    user_message_count > 0 || assistant_message_count > 0
  const has_both_tool_calls_and_cost =
    tool_call_count > 0 && thread_cost_display

  const { changed_relations, other_relations } = useMemo(() => {
    const parsed = parse_relations_for_display({ relations })
    const changed = []
    const other = []
    for (const relation of parsed) {
      // Drop fully-redacted entries (no relation_type) — they cannot be classified.
      if (relation.redacted && !relation.relation_type) continue
      if (CHANGE_RELATION_TYPES.has(relation.relation_type)) {
        changed.push(relation)
      } else {
        other.push(relation)
      }
    }
    return { changed_relations: changed, other_relations: other }
  }, [relations])

  // Track which row is rendered first
  const get_is_first = use_first_row_tracker()

  return (
    <Box>
      {session_provider && inference_provider ? (
        <TwoCellRow
          left_label='Session Provider'
          left_value={session_provider}
          right_label='Inference Provider'
          right_value={inference_provider}
          is_first={get_is_first()}
        />
      ) : (
        <>
          {session_provider && (
            <MetadataRow
              label='Session Provider'
              value={session_provider}
              is_first={get_is_first()}
            />
          )}
          {inference_provider && !session_provider && (
            <MetadataRow
              label='Inference Provider'
              value={inference_provider}
              is_first={get_is_first()}
            />
          )}
        </>
      )}

      <ModelsField models={models} />

      {session_id && (
        <MetadataRow
          label='External Session ID'
          value={<ExternalSessionIdDisplay session_id={session_id} />}
        />
      )}

      {thread_id && (
        <MetadataRow
          label='Tags'
          value={
            <EditableTagsField
              value={tags}
              base_uri={`user:thread/${thread_id}`}
            />
          }
          is_first={get_is_first()}
        />
      )}

      {/* Changes - entities the thread created or modified. Separated from the
          general Relations list so writes are visually distinct from reads/refs. */}
      {thread_id && (
        <RelatedEntities
          base_uri={`user:thread/${thread_id}`}
          forward_relations={changed_relations}
          exclude_types={['file', 'directory']}
          show_header={true}
          header_text='Changes'
          forward_only
        />
      )}

      {/* Related resources - forward relations from thread metadata + reverse from API.
          Note: RelatedEntities does not participate in is_first tracking because
          it loads asynchronously and may return null after loading completes,
          which would incorrectly consume the is_first flag. It always shows a
          top border when it has content to display. */}
      {thread_id && (
        <RelatedEntities
          base_uri={`user:thread/${thread_id}`}
          forward_relations={other_relations}
          exclude_types={['file', 'directory']}
          show_header={true}
          header_text='Relations'
        />
      )}

      {/* File and directory references - displayed collapsed with count */}
      {thread_id && (
        <CollapsibleFileReferences base_uri={`user:thread/${thread_id}`} />
      )}

      {has_dates && (
        <TwoCellRow
          left_label='Created'
          left_value={<DateDisplay date={created_at} />}
          right_label='Last Updated'
          right_value={<DateDisplay date={updated_at} />}
          is_first={get_is_first()}
        />
      )}

      {/* Display tokens with duration if available */}
      {duration && (
        <MetadataRow
          label='Duration'
          value={duration}
          is_first={get_is_first()}
        />
      )}

      {/* Message counts - show detailed breakdown if available, otherwise show total */}
      {has_message_breakdown ? (
        <TwoCellRow
          left_label='User Messages'
          left_value={user_message_count.toLocaleString()}
          right_label='Assistant Messages'
          right_value={assistant_message_count.toLocaleString()}
        />
      ) : (
        message_count > 0 && (
          <MetadataRow
            label='Messages'
            value={message_count.toLocaleString()}
          />
        )
      )}

      {/* Tool calls and cost - use TwoCellRow if both exist, otherwise show individually */}
      {has_both_tool_calls_and_cost ? (
        <TwoCellRow
          left_label='Tool Calls'
          left_value={tool_call_count.toLocaleString()}
          right_label='Estimated API Cost'
          right_value={thread_cost_display}
        />
      ) : (
        <>
          {tool_call_count > 0 && (
            <MetadataRow
              label='Tool Calls'
              value={tool_call_count.toLocaleString()}
            />
          )}
          {thread_cost_display && (
            <MetadataRow
              label='Estimated API Cost'
              value={thread_cost_display}
            />
          )}
        </>
      )}

      {working_directory && (
        <MetadataRow
          label='Directory'
          value={working_directory}
          scrollable={true}
          is_first={get_is_first()}
        />
      )}

      {git_branch && (
        <MetadataRow
          label='Git Branch'
          value={git_branch}
          scrollable={true}
          is_first={get_is_first()}
        />
      )}

      {execution && execution.mode && (
        <MetadataRow
          label='Execution'
          value={
            <span style={{ fontFamily: 'monospace' }}>
              {execution.mode}
              {execution.machine_id ? ` · ${execution.machine_id}` : ''}
              {execution.mode === 'container' && execution.container_name
                ? ` · ${execution.container_name}`
                : ''}
              {execution.mode === 'container' && execution.container_runtime
                ? ` (${execution.container_runtime})`
                : ''}
            </span>
          }
          scrollable={true}
          is_first={get_is_first()}
        />
      )}
    </Box>
  )
}

ThreadStats.propTypes = {
  session_id: PropTypes.string,
  duration: PropTypes.string,
  models: PropTypes.arrayOf(PropTypes.string).isRequired,
  source_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  created_at: PropTypes.string,
  updated_at: PropTypes.string,
  message_count: PropTypes.number,
  user_message_count: PropTypes.number,
  assistant_message_count: PropTypes.number,
  tool_call_count: PropTypes.number,
  thread_cost_display: PropTypes.string,
  thread_id: PropTypes.string,
  relations: PropTypes.array,
  tags: PropTypes.array,
  execution: PropTypes.shape({
    mode: PropTypes.string,
    machine_id: PropTypes.string,
    container_runtime: PropTypes.string,
    container_name: PropTypes.string
  }),
  inference_provider: PropTypes.string,
  git_branch: PropTypes.string
}

const SourceChips = ({ source_info, thread_state }) => {
  if (!source_info && !thread_state) return null

  return (
    <Box
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {source_info && (
        <>
          <span className='chip'>{source_info.provider}</span>
          {source_info.working_directory && (
            <span className='chip'>{source_info.working_directory}</span>
          )}
        </>
      )}
      {thread_state && <span className='chip'>{thread_state}</span>}
    </Box>
  )
}

SourceChips.propTypes = {
  source_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  thread_state: PropTypes.string
}

const ThreadHeader = ({
  metadata,
  thread_id,
  collapsible = false,
  default_collapsed = false,
  actions = null,
  title_href = null,
  sx: container_sx = {}
}) => {
  const [is_collapsed, set_is_collapsed] = useState(default_collapsed)

  useEffect(() => {
    set_is_collapsed(default_collapsed)
  }, [default_collapsed])

  const {
    title,
    description,
    duration,
    models,
    source_info,
    thread_state,
    created_at,
    updated_at,
    message_count,
    user_message_count,
    assistant_message_count,
    tool_call_count,
    working_directory_formatted,
    thread_user_public_key,
    relations,
    tags,
    execution,
    inference_provider,
    git_branch
  } = use_thread_metadata(metadata)

  // Get current user's public key and cost display from Redux store
  const app_state = useSelector(get_app)
  const current_user_public_key = app_state.get('user_public_key')
  const thread_cost_display = useSelector((state) =>
    get_thread_cost_display(state, thread_id)
  )

  // Get active session for this thread
  const ws_active_session = useSelector((state) =>
    get_active_session_for_thread(state, thread_id)
  )

  // Fallback path: ACTIVE_SESSION_* events may not have arrived on direct
  // navigation, so derive the Live Session display from persisted
  // thread.session_status when the ephemeral store is empty.
  const thread_session_status = metadata?.get?.('session_status') || null
  const thread_updated_at = metadata?.get?.('updated_at') || null
  const thread_created_at = metadata?.get?.('created_at') || null
  const synthetic_active_session = useMemo(() => {
    if (ws_active_session) return null
    const mapped = SESSION_STATUS_DISPLAY_MAP[thread_session_status]
    if (!mapped) return null
    return {
      session_id: null,
      status: mapped,
      started_at: thread_created_at,
      last_activity_at: thread_updated_at,
      total_tokens: null
    }
  }, [
    ws_active_session,
    thread_session_status,
    thread_created_at,
    thread_updated_at
  ])
  const active_session = ws_active_session || synthetic_active_session

  // Check if current user owns this thread
  const user_owns_thread =
    current_user_public_key &&
    thread_user_public_key &&
    current_user_public_key === thread_user_public_key

  const toggle_collapse = useCallback(
    () => set_is_collapsed((prev) => !prev),
    []
  )

  const merged_sx = useMemo(
    () => ({ marginTop: '16px', ...container_sx }),
    [container_sx]
  )

  const title_content = title_href ? (
    <a href={title_href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <ThreadTitle
        title={title || 'Thread'}
        description={description}
        working_directory_formatted={working_directory_formatted}
      />
    </a>
  ) : (
    <ThreadTitle
      title={title}
      description={description}
      working_directory_formatted={working_directory_formatted}
    />
  )

  return (
    <MetadataContainer
      background_color='white'
      border_radius={2}
      sx={merged_sx}>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        {actions ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1
            }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>{title_content}</Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                flexShrink: 0
              }}>
              {actions}
            </Box>
          </Box>
        ) : (
          title_content
        )}
      </Box>

      {/* Always-visible: Live Session + Thread State */}
      {(active_session || thread_state) && (
        <Box>
          {active_session && (
            <MetadataRow
              label='Live Session'
              value={
                <SessionActivityBar active_session={active_session} compact />
              }
              is_first
            />
          )}
          {thread_state && thread_id && (
            <ThreadStateField
              thread_state={thread_state}
              thread_id={thread_id}
              user_owns_thread={user_owns_thread}
              is_first={!active_session}
            />
          )}
        </Box>
      )}

      {/* Collapse toggle - after live session and thread state */}
      {collapsible && (
        <Box
          onClick={toggle_collapse}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '11px',
            color: HEADER_STYLES.TEXT_LIGHT,
            px: 3,
            py: 1,
            borderTop: `1px solid ${COLORS.border_light}`,
            '&:hover': { color: HEADER_STYLES.TEXT_MEDIUM }
          }}>
          <svg
            width='10'
            height='10'
            viewBox='0 0 10 10'
            fill='none'
            style={{
              transform: is_collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease'
            }}>
            <path
              d='M2.5 4l2.5 2.5L7.5 4'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          {is_collapsed ? 'show details' : 'hide details'}
        </Box>
      )}

      {/* Collapsible detail stats */}
      {(!collapsible || !is_collapsed) && (
        <ThreadStats
          session_id={source_info?.session_id}
          duration={duration}
          models={models}
          source_info={source_info}
          created_at={created_at}
          updated_at={updated_at}
          message_count={message_count}
          user_message_count={user_message_count}
          assistant_message_count={assistant_message_count}
          tool_call_count={tool_call_count}
          thread_cost_display={thread_cost_display}
          thread_id={thread_id}
          relations={relations}
          tags={tags}
          execution={execution}
          inference_provider={inference_provider}
          git_branch={git_branch}
        />
      )}
    </MetadataContainer>
  )
}

ThreadHeader.propTypes = {
  metadata: PropTypes.object,
  thread_id: PropTypes.string,
  collapsible: PropTypes.bool,
  default_collapsed: PropTypes.bool,
  actions: PropTypes.node,
  title_href: PropTypes.string,
  sx: PropTypes.object
}

export default ThreadHeader
