import React, { useState, useRef, useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popper,
  ClickAwayListener
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import './WorkingDirectoryPicker.styl'

import { BASE_DIRECTORIES } from '@views/utils/base-uri-constants'

// Constants
const USER_BASE_ROOT = BASE_DIRECTORIES.user
const THREAD_PATH_PREFIX = '/thread/'

/**
 * WorkingDirectoryPicker Component
 *
 * Allows users to select a working directory for thread operations.
 * Provides options for the user base root and the current directory (if applicable).
 */
export default function WorkingDirectoryPicker({
  value,
  onChange,
  current_path = null
}) {
  const [is_open, set_is_open] = useState(false)
  const anchor_ref = useRef(null)

  // Don't render on the homepage
  if (!current_path || current_path === '/') {
    return null
  }

  // Compute available directory options based on current path
  const options = useMemo(() => {
    const base_options = [
      {
        value: USER_BASE_ROOT,
        label: 'root directory',
        description: null // No secondary text for root
      }
    ]

    // Add current directory option if it's a valid filesystem path
    const is_thread_path = current_path?.startsWith(THREAD_PATH_PREFIX)
    if (current_path && !is_thread_path) {
      // Extract directory from path (handle file paths like /text/file.md -> /text)
      let directory_path = current_path
      const last_segment = current_path.split('/').pop()
      if (last_segment && last_segment.includes('.')) {
        // This is a file path, extract the directory
        directory_path = current_path.substring(
          0,
          current_path.lastIndexOf('/')
        )
        if (!directory_path) {
          directory_path = '/'
        }
      }

      const full_directory_path = USER_BASE_ROOT + directory_path

      // Only add if it's different from root
      if (full_directory_path !== USER_BASE_ROOT) {
        const relative_path = directory_path.replace(/^\//, '') || '/'
        base_options.push({
          value: full_directory_path,
          label: 'current directory',
          description: relative_path
        })
      }
    }

    return base_options
  }, [current_path])

  // Get display text for the selected value
  const display_path = useMemo(() => {
    const selected_option = options.find((opt) => opt.value === value)
    if (!selected_option) return value

    // For root directory, show label only
    if (selected_option.value === USER_BASE_ROOT) {
      return selected_option.label
    }

    // For current directory, show the path
    return selected_option.description
  }, [options, value])

  // Update the selected directory when the page changes
  useEffect(() => {
    // Determine the appropriate default directory based on available options
    let default_directory

    if (options.length > 1) {
      // If we have a current directory option, default to it
      default_directory = options[1].value
    } else {
      // Otherwise use the root
      default_directory = options[0].value
    }

    // Update to the default directory
    onChange(default_directory)
  }, [current_path]) // Only depend on current_path, not value or onChange

  // Don't render if there's only one option (root)
  if (options.length <= 1) {
    return null
  }

  // Event handlers
  const handle_toggle = () => {
    set_is_open((prev) => !prev)
  }

  const handle_close = () => {
    set_is_open(false)
  }

  const handle_select = (selected_value) => {
    onChange(selected_value)
    set_is_open(false)
  }

  return (
    <Box className='working-directory-picker'>
      {/* Clickable display showing current selection */}
      <Box
        ref={anchor_ref}
        className='directory-display'
        onClick={handle_toggle}>
        <Box className='directory-content'>
          <Typography variant='caption' className='picker-label'>
            Working Directory
          </Typography>
          <Typography variant='body2' className='directory-path'>
            {display_path}
          </Typography>
        </Box>
        <KeyboardArrowDownIcon
          className={`arrow-icon ${is_open ? 'open' : ''}`}
        />
      </Box>

      {/* Dropdown menu with directory options */}
      <Popper
        open={is_open}
        anchorEl={anchor_ref.current}
        placement='bottom-start'
        style={{ zIndex: 1300 }}
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 8]
            }
          }
        ]}>
        <ClickAwayListener onClickAway={handle_close}>
          <Paper className='directory-options' elevation={3}>
            <List>
              {options.map((option) => (
                <ListItem key={option.value} disablePadding>
                  <ListItemButton
                    selected={option.value === value}
                    onClick={() => handle_select(option.value)}>
                    <ListItemText
                      primary={option.label}
                      secondary={option.description}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  )
}

WorkingDirectoryPicker.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  current_path: PropTypes.string
}
