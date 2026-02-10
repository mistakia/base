import React, { useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Box
} from '@mui/material'
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Description as DescriptionIcon,
  Code as CodeIcon
} from '@mui/icons-material'

import { COLORS } from '@theme/colors.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import {
  directory_actions,
  get_directory_items,
  get_directory_state
} from '@core/directory'
import {
  git_actions,
  get_is_git_root,
  get_repo_statistics,
  get_is_loading_repo_info,
  has_cached_repo_info
} from '@core/git'
import { RedactedContent } from '@components/primitives/styled'
import GitRepoInfo from '@components/GitRepoInfo'

const DirectoryView = ({ path = '', on_navigate }) => {
  const dispatch = useDispatch()
  const items = useSelector(get_directory_items)
  const directory_state = useSelector(get_directory_state)
  const loading = directory_state.get('is_loading_directory')
  const error = directory_state.get('directory_error')

  // Git repository info state - selectors now take path parameter
  const is_git_root = useSelector((state) => get_is_git_root(state, path))
  const repo_statistics = useSelector((state) =>
    get_repo_statistics(state, path)
  )
  const is_loading_repo_info = useSelector((state) =>
    get_is_loading_repo_info(state, path)
  )
  const is_cached = useSelector((state) => has_cached_repo_info(state, path))

  useEffect(() => {
    dispatch(directory_actions.load_directory(path))
  }, [dispatch, path])

  // Load git repo info when path changes (only if not cached)
  useEffect(() => {
    if (!is_cached) {
      dispatch(git_actions.load_repo_info(path))
    }
  }, [dispatch, path, is_cached])

  const sorted_items = React.useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }

      const a_value = a.name
      const b_value = b.name

      return a_value < b_value ? -1 : a_value > b_value ? 1 : 0
    })
    return sorted
  }, [items])

  // Memoize TableContainer styles to prevent unnecessary re-renders
  // Must be before early returns to maintain consistent hook order
  const table_container_sx = useMemo(
    () => ({
      overflow: 'auto',
      border: `1px solid ${COLORS.border_light}`,
      borderTopLeftRadius: is_git_root ? '0' : '6px',
      borderTopRightRadius: is_git_root ? '0' : '6px',
      borderBottomLeftRadius: '6px',
      borderBottomRightRadius: '6px',
      backgroundColor: 'white',
      width: '100%',
      maxWidth: '100%'
    }),
    [is_git_root]
  )

  const get_file_icon = (item) => {
    if (item.type === 'directory') {
      return <FolderIcon sx={{ color: COLORS.icon_folder, fontSize: 18 }} />
    }

    const ext = item.name.split('.').pop().toLowerCase()
    switch (ext) {
      case 'md':
      case 'txt':
        return (
          <DescriptionIcon sx={{ color: COLORS.icon_file, fontSize: 18 }} />
        )
      case 'js':
      case 'mjs':
      case 'json':
      case 'ts':
      case 'tsx':
        return <CodeIcon sx={{ color: COLORS.icon_file, fontSize: 18 }} />
      default:
        return <FileIcon sx={{ color: COLORS.icon_file, fontSize: 18 }} />
    }
  }

  const format_file_size = (bytes) => {
    if (!bytes) return '-'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const open_in_new_tab = (target_path) => {
    const final_path = target_path || '/'
    window.open(final_path, '_blank', 'noopener,noreferrer')
  }

  const build_item_path = (item) => {
    return path ? `${path}/${item.name}` : `/${item.name}`
  }

  const handle_item_click = (event, item) => {
    // Prevent navigation for redacted items
    if (item.is_redacted) {
      return
    }

    const new_path = build_item_path(item)

    if (event?.metaKey || event?.ctrlKey) {
      open_in_new_tab(new_path)
      return
    }

    on_navigate(new_path)
  }

  const handle_item_mouse_down = (event, item) => {
    // Prevent middle-click navigation for redacted items
    if (item.is_redacted) {
      return
    }

    if (event.button === 1) {
      const new_path = build_item_path(item)
      open_in_new_tab(new_path)
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <div>Loading directory contents...</div>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <div style={{ color: COLORS.error }}>Error: {error}</div>
      </Box>
    )
  }

  const name_style = {
    color: COLORS.icon_link,
    fontSize: '13px',
    lineHeight: '20px',
    textDecoration: 'none'
  }

  const get_name_style = (item) => ({
    ...name_style,
    cursor: item.is_redacted ? 'default' : 'pointer'
  })

  return (
    <>
      {/* Git repository info - shown when directory is a git root */}
      {(is_git_root || is_loading_repo_info) && (
        <GitRepoInfo
          statistics={repo_statistics}
          is_loading={is_loading_repo_info}
          compact={true}
        />
      )}

      <TableContainer sx={table_container_sx}>
        <Table size='small' sx={{ width: '100%', tableLayout: 'fixed' }}>
          <TableBody>
            {sorted_items.map((item, index) => (
              <TableRow
                key={item.name}
                hover={!item.is_redacted}
                sx={{
                  cursor: item.is_redacted ? 'default' : 'pointer',
                  height: 41,
                  '&:hover': {
                    backgroundColor: item.is_redacted
                      ? 'transparent'
                      : 'rgba(0, 0, 0, 0.04)'
                  }
                }}
                onClick={(e) => handle_item_click(e, item)}
                onMouseDown={(e) => handle_item_mouse_down(e, item)}>
                <TableCell
                  sx={{
                    py: 0,
                    px: 2,
                    width: '65%',
                    borderBottom:
                      index === sorted_items.length - 1
                        ? 'none'
                        : `1px solid ${COLORS.border_light}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      minWidth: 0,
                      width: '100%'
                    }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        width: 20,
                        height: 20
                      }}>
                      {get_file_icon(item)}
                    </Box>
                    {item.is_redacted ? (
                      <RedactedContent
                        content_type='filename'
                        show_tooltip={true}
                        title={item.name}
                        sx={{
                          ...get_name_style(item),
                          color: COLORS.text_secondary
                        }}>
                        {item.name}
                      </RedactedContent>
                    ) : (
                      <span
                        title={item.name}
                        style={{
                          ...get_name_style(item),
                          minWidth: 0,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.textDecoration = 'underline'
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.textDecoration = 'none'
                        }}>
                        {item.name}
                      </span>
                    )}
                  </Box>
                </TableCell>
                <TableCell
                  align='right'
                  sx={{
                    py: 0,
                    px: 2,
                    width: '80px',
                    borderBottom:
                      index === sorted_items.length - 1
                        ? 'none'
                        : `1px solid ${COLORS.border_light}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                  {item.is_redacted && item.type === 'file' ? (
                    <RedactedContent
                      content_type='file_size'
                      show_tooltip={true}
                      sx={{ fontSize: '12px', color: COLORS.text_secondary }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: '12px',
                        color: COLORS.text_secondary
                      }}>
                      {item.type === 'directory'
                        ? '-'
                        : format_file_size(item.size)}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  align='right'
                  sx={{
                    py: 0,
                    px: 2,
                    width: '100px',
                    borderBottom:
                      index === sorted_items.length - 1
                        ? 'none'
                        : `1px solid ${COLORS.border_light}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                  {item.is_redacted ? (
                    <RedactedContent
                      content_type='date'
                      show_tooltip={true}
                      sx={{ fontSize: '12px', color: COLORS.text_secondary }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: '12px',
                        color: COLORS.text_secondary
                      }}>
                      {item.modified
                        ? format_relative_time(item.modified)
                        : '-'}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}

DirectoryView.propTypes = {
  path: PropTypes.string,
  on_navigate: PropTypes.func.isRequired
}

export default DirectoryView
