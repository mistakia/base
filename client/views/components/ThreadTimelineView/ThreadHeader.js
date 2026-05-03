import React, { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip
} from '@mui/material'
import { useSelector } from 'react-redux'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { COLORS } from '@theme/colors.js'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'
import '@styles/chip.styl'
import { get_thread_cost_display } from '@core/threads/selectors'
import { get_app, get_user_token } from '@core/app/selectors'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay,
  ThreadStateField,
  ModelsField,
  CollapsibleFileReferences,
  format_token_shorthand
} from '@views/components/MetadataDisplay'
import RelatedEntities from '@views/components/RelatedEntities'
import { api, api_request } from '@core/api/service'
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Description as DescriptionIcon,
  Code as CodeIcon
} from '@mui/icons-material'
import { format_relative_time } from '@views/utils/date-formatting.js'
import ThreadLifecycleIndicator from '@components/ThreadLifecycleIndicator/ThreadLifecycleIndicator.js'
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
  extract_tags,
  extract_context_token_state
} from '@views/utils/thread-metadata-extractor.js'
import { parse_relations_for_display } from '#libs-shared/relation-parser.mjs'

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

const ExpandChevron = ({ expanded }) => (
  <svg
    width='10'
    height='10'
    viewBox='0 0 10 10'
    fill='none'
    style={{
      transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
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
)

ExpandChevron.propTypes = {
  expanded: PropTypes.bool.isRequired
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
    const context_tokens = extract_context_token_state(metadata)

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
      tags,
      context_tokens
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

const BREAKDOWN_TOOLTIPS = {
  uncached:
    'Prompt tokens that were neither served from nor written to the prompt cache on this turn — i.e. the delta beyond the last cache breakpoint.',
  cache_write:
    'Prompt tokens being written to the prompt cache on this turn (billed at ~1.25× the input rate).',
  cache_read:
    'Prompt tokens served from the prompt cache (billed at ~0.1× the input rate).',
  output: 'Tokens generated by the model.'
}

const BreakdownCell = ({ label, value, tooltip }) => (
  <Box
    sx={{
      flex: 1,
      minWidth: 0,
      px: '12px',
      py: '8px',
      borderRight: `1px solid ${COLORS.border_light}`,
      '&:last-of-type': { borderRight: 'none' }
    }}>
    <Tooltip title={tooltip} placement='top' arrow disableInteractive>
      <Box
        sx={{
          display: 'block',
          mb: '4px',
          fontSize: '10px',
          fontWeight: 500,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color: HEADER_STYLES.TEXT_LIGHT,
          cursor: 'help'
        }}>
        <Box
          component='span'
          sx={{
            // Underline tracks the text exactly across line wraps, unlike
            // borderBottom on a block container.
            textDecoration: 'underline dotted',
            textUnderlineOffset: '2px',
            textDecorationColor: COLORS.border
          }}>
          {label}
        </Box>
      </Box>
    </Tooltip>
    <Box sx={{ fontSize: '13px', color: HEADER_STYLES.TEXT_DARK }}>
      {value}
    </Box>
  </Box>
)

BreakdownCell.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  tooltip: PropTypes.string.isRequired
}

const BreakdownGroup = ({ title, subtitle, children }) => (
  <Box sx={{ borderTop: `1px solid ${COLORS.border}` }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        px: '12px',
        pt: '10px',
        pb: '4px'
      }}>
      <Box
        sx={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: HEADER_STYLES.TEXT_DARK
        }}>
        {title}
      </Box>
      {subtitle && (
        <Box
          sx={{
            fontSize: '10px',
            color: HEADER_STYLES.TEXT_LIGHT,
            textTransform: 'lowercase'
          }}>
          {subtitle}
        </Box>
      )}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'stretch' }}>{children}</Box>
  </Box>
)

BreakdownGroup.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node.isRequired
}

const TokenBreakdownRows = ({ context_tokens }) => {
  const [expanded, set_expanded] = useState(false)

  const has_context =
    context_tokens.context_input_tokens > 0 ||
    context_tokens.context_cache_creation_input_tokens > 0 ||
    context_tokens.context_cache_read_input_tokens > 0
  const has_cumulative =
    context_tokens.cumulative_input_tokens > 0 ||
    context_tokens.cumulative_output_tokens > 0 ||
    context_tokens.cumulative_cache_creation_input_tokens > 0 ||
    context_tokens.cumulative_cache_read_input_tokens > 0

  if (!has_context && !has_cumulative) return null

  const fmt = (count) => format_token_shorthand({ count })

  return (
    <Box sx={{ backgroundColor: COLORS.surface_hover }}>
      <Box
        onClick={() => set_expanded((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '11px',
          color: HEADER_STYLES.TEXT_LIGHT,
          px: '12px',
          py: '6px',
          borderTop: `1px solid ${COLORS.border}`,
          '&:hover': { color: HEADER_STYLES.TEXT_MEDIUM }
        }}>
        <ExpandChevron expanded={expanded} />
        {expanded ? 'hide token breakdown' : 'show token breakdown'}
      </Box>
      {expanded && has_context && (
        <BreakdownGroup title='Context' subtitle='latest turn'>
          <BreakdownCell
            label='Uncached Input'
            value={fmt(context_tokens.context_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.uncached}
          />
          <BreakdownCell
            label='Cache Write'
            value={fmt(context_tokens.context_cache_creation_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.cache_write}
          />
          <BreakdownCell
            label='Cache Read'
            value={fmt(context_tokens.context_cache_read_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.cache_read}
          />
        </BreakdownGroup>
      )}
      {expanded && has_cumulative && (
        <BreakdownGroup title='Cumulative' subtitle='all turns'>
          <BreakdownCell
            label='Uncached Input'
            value={fmt(context_tokens.cumulative_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.uncached}
          />
          <BreakdownCell
            label='Output'
            value={fmt(context_tokens.cumulative_output_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.output}
          />
          <BreakdownCell
            label='Cache Write'
            value={fmt(context_tokens.cumulative_cache_creation_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.cache_write}
          />
          <BreakdownCell
            label='Cache Read'
            value={fmt(context_tokens.cumulative_cache_read_input_tokens)}
            tooltip={BREAKDOWN_TOOLTIPS.cache_read}
          />
        </BreakdownGroup>
      )}
    </Box>
  )
}

TokenBreakdownRows.propTypes = {
  context_tokens: PropTypes.shape({
    context_input_tokens: PropTypes.number,
    context_cache_creation_input_tokens: PropTypes.number,
    context_cache_read_input_tokens: PropTypes.number,
    cumulative_input_tokens: PropTypes.number,
    cumulative_output_tokens: PropTypes.number,
    cumulative_cache_creation_input_tokens: PropTypes.number,
    cumulative_cache_read_input_tokens: PropTypes.number
  }).isRequired
}

const get_folder_item_icon = (item) => {
  if (item.type === 'directory') {
    return <FolderIcon sx={{ color: COLORS.icon_folder, fontSize: 16 }} />
  }
  const ext = item.name.split('.').pop().toLowerCase()
  switch (ext) {
    case 'md':
    case 'txt':
      return <DescriptionIcon sx={{ color: COLORS.icon_file, fontSize: 16 }} />
    case 'js':
    case 'mjs':
    case 'json':
    case 'jsonl':
    case 'ts':
    case 'tsx':
      return <CodeIcon sx={{ color: COLORS.icon_file, fontSize: 16 }} />
    default:
      return <FileIcon sx={{ color: COLORS.icon_file, fontSize: 16 }} />
  }
}

const format_folder_item_size = (bytes) => {
  if (bytes == null) return '-'
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

const ThreadFolderContents = ({ thread_id }) => {
  const [expanded, set_expanded] = useState(false)
  const [items, set_items] = useState(null)
  const [loading, set_loading] = useState(false)
  const [error, set_error] = useState(null)
  const token = useSelector(get_user_token)
  const folder_path = `thread/${thread_id}`

  useEffect(() => {
    if (!expanded || items !== null) return
    let cancelled = false
    set_loading(true)
    set_error(null)
    ;(async () => {
      try {
        const { request } = api_request(
          api.get_directories,
          { path: folder_path },
          token
        )
        const data = await request()
        if (cancelled) return
        set_items(Array.isArray(data?.items) ? data.items : [])
      } catch (err) {
        if (cancelled) return
        set_error(err.message || 'Failed to load folder contents')
      } finally {
        if (!cancelled) set_loading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [expanded, folder_path, token])

  return (
    <Box sx={{ backgroundColor: COLORS.surface_hover }}>
      <Box
        onClick={() => set_expanded((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '11px',
          color: HEADER_STYLES.TEXT_LIGHT,
          px: '12px',
          py: '6px',
          borderTop: `1px solid ${COLORS.border}`,
          '&:hover': { color: HEADER_STYLES.TEXT_MEDIUM }
        }}>
        <ExpandChevron expanded={expanded} />
        {expanded ? 'hide thread folder contents' : 'show thread folder contents'}
      </Box>
      {expanded && (
        <Box>
          {loading && (
            <Box
              sx={{
                px: '12px',
                py: '10px',
                fontSize: '12px',
                color: HEADER_STYLES.TEXT_LIGHT
              }}>
              loading…
            </Box>
          )}
          {error && (
            <Box
              sx={{
                px: '12px',
                py: '10px',
                fontSize: '12px',
                color: COLORS.error
              }}>
              {error}
            </Box>
          )}
          {!loading && !error && items && items.length === 0 && (
            <Box
              sx={{
                px: '12px',
                py: '10px',
                fontSize: '12px',
                color: HEADER_STYLES.TEXT_LIGHT
              }}>
              empty
            </Box>
          )}
          {!loading && !error && items && items.length > 0 && (
            <TableContainer>
              <Table size='small' sx={{ width: '100%', tableLayout: 'fixed' }}>
                <TableBody>
                  {items.map((item, index) => {
                    const href = `/${folder_path}/${item.name}`
                    const is_last = index === items.length - 1
                    const cell_border = is_last
                      ? 'none'
                      : `1px solid ${COLORS.border_light}`
                    return (
                      <TableRow
                        key={item.name}
                        hover
                        component='a'
                        href={href}
                        data-internal-link='true'
                        sx={{
                          cursor: 'pointer',
                          height: 36,
                          textDecoration: 'none',
                          display: 'table-row',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.04)'
                          }
                        }}>
                        <TableCell
                          sx={{
                            py: 0,
                            px: 1.5,
                            width: '60%',
                            borderBottom: cell_border,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              minWidth: 0
                            }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                width: 18,
                                height: 18,
                                flexShrink: 0
                              }}>
                              {get_folder_item_icon(item)}
                            </Box>
                            <span
                              title={item.name}
                              style={{
                                color: COLORS.icon_link,
                                fontSize: '12px',
                                lineHeight: '18px',
                                minWidth: 0,
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                              {item.name}
                            </span>
                          </Box>
                        </TableCell>
                        <TableCell
                          align='right'
                          sx={{
                            py: 0,
                            px: 1.5,
                            width: '70px',
                            borderBottom: cell_border,
                            fontSize: '11px',
                            color: COLORS.text_secondary
                          }}>
                          {item.type === 'directory'
                            ? '-'
                            : format_folder_item_size(item.size)}
                        </TableCell>
                        <TableCell
                          align='right'
                          sx={{
                            py: 0,
                            px: 1.5,
                            width: '90px',
                            borderBottom: cell_border,
                            fontSize: '11px',
                            color: COLORS.text_secondary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                          {item.modified
                            ? format_relative_time(new Date(item.modified))
                            : '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </Box>
  )
}

ThreadFolderContents.propTypes = {
  thread_id: PropTypes.string.isRequired
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
  git_branch,
  context_tokens
}) => {
  const [details_expanded, set_details_expanded] = useState(false)

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

  return (
    <Box>
      {session_provider && inference_provider ? (
        <TwoCellRow
          left_label='Session Provider'
          left_value={session_provider}
          right_label='Inference Provider'
          right_value={inference_provider}
        />
      ) : (
        <>
          {session_provider && (
            <MetadataRow
              label='Session Provider'
              value={session_provider}
            />
          )}
          {inference_provider && !session_provider && (
            <MetadataRow
              label='Inference Provider'
              value={inference_provider}
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
        />
      )}

      {context_tokens?.context_size > 0 && (
        <TwoCellRow
          left_label='Context Size'
          left_value={format_token_shorthand({
            count: context_tokens.context_size
          })}
          right_label='Cache Efficiency'
          right_value={
            context_tokens.cache_efficiency != null
              ? `${(context_tokens.cache_efficiency * 100).toFixed(1)}%`
              : '—'
          }
        />
      )}

      {context_tokens?.context_size > 0 && (
        <TokenBreakdownRows context_tokens={context_tokens} />
      )}

      {/* Display tokens with duration if available */}
      {duration && (
        <MetadataRow
          label='Duration'
          value={duration}
        />
      )}

      <Box sx={{ backgroundColor: COLORS.surface_hover }}>
        <Box
          onClick={() => set_details_expanded((v) => !v)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '11px',
            color: HEADER_STYLES.TEXT_LIGHT,
            px: '12px',
            py: '6px',
            borderTop: `1px solid ${COLORS.border}`,
            '&:hover': { color: HEADER_STYLES.TEXT_MEDIUM }
          }}>
          <ExpandChevron expanded={details_expanded} />
          {details_expanded
            ? 'hide counts, cost, and directory'
            : 'show counts, cost, and directory'}
        </Box>

        {details_expanded && (
          <>
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
              />
            )}
          </>
        )}
      </Box>

      {git_branch && (
        <MetadataRow
          label='Git Branch'
          value={git_branch}
          scrollable={true}
        />
      )}

      {execution && execution.environment && (
        <MetadataRow
          label='Execution'
          value={
            <span style={{ fontFamily: 'monospace' }}>
              {execution.environment}
              {execution.machine_id ? ` · ${execution.machine_id}` : ''}
              {execution.environment === 'controlled_container' &&
              execution.container_name
                ? ` · ${execution.container_name}`
                : ''}
              {execution.environment === 'controlled_container' &&
              execution.container_runtime
                ? ` (${execution.container_runtime})`
                : ''}
            </span>
          }
          scrollable={true}
        />
      )}

      {/* Thread folder contents - lists files/subdirs under thread/<id>/ */}
      {thread_id && <ThreadFolderContents thread_id={thread_id} />}
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
  git_branch: PropTypes.string,
  context_tokens: PropTypes.shape({
    context_input_tokens: PropTypes.number,
    context_cache_creation_input_tokens: PropTypes.number,
    context_cache_read_input_tokens: PropTypes.number,
    cumulative_input_tokens: PropTypes.number,
    cumulative_output_tokens: PropTypes.number,
    cumulative_cache_creation_input_tokens: PropTypes.number,
    cumulative_cache_read_input_tokens: PropTypes.number,
    context_size: PropTypes.number,
    cache_efficiency: PropTypes.number
  })
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
    git_branch,
    context_tokens
  } = use_thread_metadata(metadata)

  // Get current user's public key and cost display from Redux store
  const app_state = useSelector(get_app)
  const current_user_public_key = app_state.get('user_public_key')
  const thread_cost_display = useSelector((state) =>
    get_thread_cost_display(state, thread_id)
  )

  const thread_session_status = metadata?.get?.('session_status') || null
  const thread_user_message_count = metadata?.get?.('user_message_count') || 0

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
      {(thread_session_status || thread_state) && (
        <Box>
          {thread_session_status && (
            <MetadataRow
              label='Live Session'
              value={
                <ThreadLifecycleIndicator
                  status={thread_session_status}
                  thread_id={thread_id}
                  user_message_count={thread_user_message_count}
                  variant='inline'
                />
              }
              is_first
            />
          )}
          {thread_state && thread_id && (
            <ThreadStateField
              thread_state={thread_state}
              thread_id={thread_id}
              user_owns_thread={user_owns_thread}
              is_first={!thread_session_status}
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
          <ExpandChevron expanded={!is_collapsed} />
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
          context_tokens={context_tokens}
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
