import React, { useEffect } from 'react'
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
import { format_relative_time } from '@views/utils/date-formatting.js'
import {
  directory_actions,
  get_directory_items,
  get_directory_state
} from '@core/directory'

const DirectoryView = ({ path, on_navigate }) => {
  const dispatch = useDispatch()
  const items = useSelector(get_directory_items)
  const directory_state = useSelector(get_directory_state)
  const loading = directory_state.get('is_loading_directory')
  const error = directory_state.get('directory_error')

  useEffect(() => {
    dispatch(directory_actions.load_directory(path))
  }, [path])

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

  const get_file_icon = (item) => {
    if (item.type === 'directory') {
      return <FolderIcon sx={{ color: '#79b8ff', fontSize: 18 }} />
    }

    const ext = item.name.split('.').pop().toLowerCase()
    switch (ext) {
      case 'md':
      case 'txt':
        return <DescriptionIcon sx={{ color: '#959da5', fontSize: 18 }} />
      case 'js':
      case 'mjs':
      case 'json':
      case 'ts':
      case 'tsx':
        return <CodeIcon sx={{ color: '#959da5', fontSize: 18 }} />
      default:
        return <FileIcon sx={{ color: '#959da5', fontSize: 18 }} />
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
    const new_path = build_item_path(item)

    if (event?.metaKey || event?.ctrlKey) {
      open_in_new_tab(new_path)
      return
    }

    on_navigate(new_path)
  }

  const handle_item_mouse_down = (event, item) => {
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
        <div style={{ color: '#f44336' }}>Error: {error}</div>
      </Box>
    )
  }

  const name_style = {
    color: '#0366d6',
    fontSize: '13px',
    lineHeight: '20px',
    textDecoration: 'none',
    cursor: 'pointer'
  }

  return (
    <TableContainer
      sx={{
        overflow: 'visible',
        border: '1px solid #e1e4e8',
        borderRadius: '6px',
        backgroundColor: 'white'
      }}>
      <Table sx={{ minWidth: 650 }} size='small'>
        <TableBody>
          {sorted_items.map((item) => (
            <TableRow
              key={item.name}
              hover
              sx={{
                cursor: 'pointer',
                height: 41,
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)'
                }
              }}
              onClick={(e) => handle_item_click(e, item)}
              onMouseDown={(e) => handle_item_mouse_down(e, item)}>
              <TableCell
                sx={{ py: 0, px: 2, borderBottom: '1px solid #e1e4e8' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      width: 20,
                      height: 20
                    }}>
                    {get_file_icon(item)}
                  </Box>
                  <span
                    style={name_style}
                    onMouseEnter={(e) => {
                      e.target.style.textDecoration = 'underline'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.textDecoration = 'none'
                    }}>
                    {item.name}
                  </span>
                </Box>
              </TableCell>
              <TableCell
                align='right'
                sx={{ py: 0, px: 2, borderBottom: '1px solid #e1e4e8' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {item.type === 'directory'
                    ? '-'
                    : format_file_size(item.size)}
                </span>
              </TableCell>
              <TableCell
                align='right'
                sx={{ py: 0, px: 2, borderBottom: '1px solid #e1e4e8' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {item.modified ? format_relative_time(item.modified) : '-'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

DirectoryView.propTypes = {
  path: PropTypes.string,
  on_navigate: PropTypes.func.isRequired
}

DirectoryView.defaultProps = {
  path: ''
}

export default DirectoryView
