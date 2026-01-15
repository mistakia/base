/**
 * CollapsibleFileReferences Component
 *
 * Displays file and directory references in a collapsible format.
 * Shows a count when collapsed, and a list of links when expanded.
 */

import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box, Collapse } from '@mui/material'
import { useSelector } from 'react-redux'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'

import { COLORS } from '@theme/colors.js'
import { api, api_request } from '@core/api/service'
import { get_user_token } from '@core/app/selectors'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const container_sx = {
  position: 'relative',
  minHeight: '48px'
}

const get_border_sx = (is_first) => ({
  borderTop: is_first ? 'none' : `1px solid ${COLORS.border}`
})

const header_button_sx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '12px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: COLORS.surface_hover
  }
}

const label_container_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}

const label_sx = {
  fontSize: '11px',
  fontWeight: 500,
  color: COLORS.text_secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
}

const count_badge_sx = {
  fontSize: '11px',
  fontWeight: 600,
  color: COLORS.text_tertiary,
  backgroundColor: COLORS.surface_hover,
  padding: '2px 6px',
  borderRadius: '10px',
  minWidth: '20px',
  textAlign: 'center'
}

const expand_icon_sx = {
  fontSize: '18px',
  color: COLORS.text_tertiary
}

const content_container_sx = {
  px: '12px',
  pb: '12px'
}

const section_sx = {
  marginBottom: '8px',
  '&:last-child': {
    marginBottom: 0
  }
}

const section_header_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '10px',
  fontWeight: 600,
  color: COLORS.text_tertiary,
  marginBottom: '4px',
  textTransform: 'uppercase'
}

const section_icon_sx = {
  fontSize: '12px'
}

const list_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
}

const link_sx = {
  fontSize: '12px',
  color: COLORS.icon_link,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  display: 'block'
}

const get_entity_link = (base_uri) => {
  try {
    return convert_base_uri_to_path(base_uri)
  } catch (error) {
    // Fallback for file references
    if (base_uri && base_uri.startsWith('file:')) {
      return `/files?path=${encodeURIComponent(base_uri.replace('file:', ''))}`
    }
    return '#'
  }
}

const get_display_title = ({ title, base_uri }) => {
  if (title) return title

  // Extract filename from base_uri
  if (!base_uri) return 'Unknown'
  const parts = base_uri.split('/')
  const filename = parts[parts.length - 1] || base_uri
  return filename
}

const ReferenceLink = ({ base_uri, title }) => {
  const display_title = get_display_title({ title, base_uri })
  const href = get_entity_link(base_uri)

  return (
    <a
      href={href}
      style={link_sx}
      data-internal-link='true'
      title={base_uri}
      onMouseEnter={(event) => {
        event.target.style.color = COLORS.info
      }}
      onMouseLeave={(event) => {
        event.target.style.color = COLORS.icon_link
      }}>
      {display_title}
    </a>
  )
}

ReferenceLink.propTypes = {
  base_uri: PropTypes.string.isRequired,
  title: PropTypes.string
}

const CollapsibleFileReferences = ({
  base_uri,
  is_first = false
}) => {
  const [expanded, set_expanded] = useState(false)
  const [file_references, set_file_references] = useState([])
  const [directory_references, set_directory_references] = useState([])
  const [loading, set_loading] = useState(true)

  // Get auth token from Redux store
  const token = useSelector(get_user_token)

  const fetch_file_references = useCallback(async () => {
    if (!base_uri) {
      set_loading(false)
      return
    }

    try {
      // Fetch file references
      const { request: file_request } = api_request(
        api.get_entity_relations,
        { base_uri, direction: 'forward', entity_type: 'file', limit: 100 },
        token
      )
      const file_data = await file_request()

      // Fetch directory references
      const { request: dir_request } = api_request(
        api.get_entity_relations,
        { base_uri, direction: 'forward', entity_type: 'directory', limit: 100 },
        token
      )
      const dir_data = await dir_request()

      set_file_references(file_data.forward || [])
      set_directory_references(dir_data.forward || [])
    } catch (err) {
      console.error('Error fetching file references:', err)
    } finally {
      set_loading(false)
    }
  }, [base_uri, token])

  useEffect(() => {
    fetch_file_references()
  }, [fetch_file_references])

  const total_count = file_references.length + directory_references.length

  // Don't render if no references
  if (!loading && total_count === 0) {
    return null
  }

  // Don't render while loading
  if (loading) {
    return null
  }

  const toggle_expanded = () => {
    set_expanded(!expanded)
  }

  return (
    <Box sx={{ ...container_sx, ...get_border_sx(is_first) }}>
      <Box
        component='button'
        onClick={toggle_expanded}
        sx={header_button_sx}>
        <Box sx={label_container_sx}>
          <Box component='span' sx={label_sx}>
            File References
          </Box>
          <Box component='span' sx={count_badge_sx}>
            {total_count}
          </Box>
        </Box>
        {expanded ? (
          <ExpandLessIcon sx={expand_icon_sx} />
        ) : (
          <ExpandMoreIcon sx={expand_icon_sx} />
        )}
      </Box>

      <Collapse in={expanded}>
        <Box sx={content_container_sx}>
          {file_references.length > 0 && (
            <Box sx={section_sx}>
              <Box sx={section_header_sx}>
                <InsertDriveFileOutlinedIcon sx={section_icon_sx} />
                Files ({file_references.length})
              </Box>
              <Box sx={list_sx}>
                {file_references.map((ref) => (
                  <ReferenceLink
                    key={ref.base_uri}
                    base_uri={ref.base_uri}
                    title={ref.title}
                  />
                ))}
              </Box>
            </Box>
          )}

          {directory_references.length > 0 && (
            <Box sx={section_sx}>
              <Box sx={section_header_sx}>
                <FolderOutlinedIcon sx={section_icon_sx} />
                Directories ({directory_references.length})
              </Box>
              <Box sx={list_sx}>
                {directory_references.map((ref) => (
                  <ReferenceLink
                    key={ref.base_uri}
                    base_uri={ref.base_uri}
                    title={ref.title}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

CollapsibleFileReferences.propTypes = {
  base_uri: PropTypes.string.isRequired,
  is_first: PropTypes.bool
}

export default CollapsibleFileReferences
