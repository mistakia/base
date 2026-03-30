import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import { Box, ButtonBase } from '@mui/material'
import { useSelector } from 'react-redux'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import LinkIcon from '@mui/icons-material/Link'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'
import { convert_url_path_to_filesystem_path } from '@views/utils/base-uri-constants.js'
import CursorLogo from '@components/primitives/logos/CursorLogo.js'
import ShareLinkDialog from '@components/ShareLinkDialog/ShareLinkDialog.js'
import { get_app } from '@core/app/selectors'
import { COLORS } from '@theme/colors.js'

const EXTENSION_LABELS = {
  md: 'Markdown',
  json: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  js: 'JavaScript',
  mjs: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  jsx: 'JavaScript',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  csv: 'CSV',
  txt: 'text',
  py: 'Python',
  sh: 'shell',
  sql: 'SQL',
  styl: 'Stylus'
}

function get_file_label(file_path) {
  if (!file_path) return { view_label: 'View as Markdown', is_markdown: true }

  const ext_match = file_path.match(/\.([a-zA-Z0-9]+)$/)
  if (!ext_match) {
    return { view_label: 'View as Markdown', is_markdown: true }
  }

  const ext = ext_match[1].toLowerCase()
  const label = EXTENSION_LABELS[ext]

  if (ext === 'md') {
    return { view_label: 'View as Markdown', is_markdown: true }
  }

  if (label) {
    return { view_label: `View as raw ${label} file`, is_markdown: false }
  }

  return { view_label: `View as raw .${ext} file`, is_markdown: false }
}

function use_anchored_position(container_ref, is_open) {
  const [position, set_position] = useState(null)
  const menu_node = useRef(null)

  const update_position = useCallback(() => {
    if (!container_ref.current) return

    const rect = container_ref.current.getBoundingClientRect()
    const menu_height = menu_node.current ? menu_node.current.offsetHeight : 0
    const gap = 4
    const space_below = window.innerHeight - rect.bottom - gap
    const space_above = rect.top - gap

    if (menu_height > space_below && space_above > space_below) {
      set_position({
        bottom: window.innerHeight - rect.top + gap,
        right: window.innerWidth - rect.right,
        placement: 'above'
      })
    } else {
      set_position({
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right,
        placement: 'below'
      })
    }
  }, [container_ref])

  const menu_ref = useCallback(
    (node) => {
      menu_node.current = node
      if (node) update_position()
    },
    [update_position]
  )

  useEffect(() => {
    if (!is_open) {
      set_position(null)
      menu_node.current = null
      return
    }

    update_position()
    window.addEventListener('scroll', update_position, true)
    window.addEventListener('resize', update_position)
    return () => {
      window.removeEventListener('scroll', update_position, true)
      window.removeEventListener('resize', update_position)
    }
  }, [is_open, update_position])

  return { position, menu_ref, menu_node }
}

const CopyPageButton = ({ path, content, entity_id, entity_title, entity_owner_key }) => {
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const [is_menu_open, set_is_menu_open] = useState(false)
  const [is_share_dialog_open, set_is_share_dialog_open] = useState(false)
  const container_ref = useRef(null)

  const {
    position: menu_position,
    menu_ref,
    menu_node
  } = use_anchored_position(container_ref, is_menu_open)

  const app_state = useSelector(get_app)
  const user_public_key = app_state.get('user_public_key')
  const has_private_key = !!app_state.get('user_private_key')
  const can_share = has_private_key && entity_id && user_public_key === entity_owner_key

  const is_copied = copied_value === content

  const { view_label, is_markdown } = get_file_label(path)

  const handle_copy = useCallback(() => {
    if (content) {
      copy_to_clipboard(content)
    }
    set_is_menu_open(false)
  }, [content, copy_to_clipboard])

  const handle_toggle_menu = useCallback(() => {
    set_is_menu_open((prev) => !prev)
  }, [])

  const get_raw_url = useCallback(() => {
    if (!path) return null
    const clean = path.startsWith('/') ? path.slice(1) : path
    const file_path = /\.[a-zA-Z0-9]+$/.test(clean) ? clean : clean + '.md'
    return '/raw/' + file_path
  }, [path])

  const handle_view_raw = useCallback(() => {
    const url = get_raw_url()
    if (url) {
      window.open(url, '_blank')
    }
    set_is_menu_open(false)
  }, [get_raw_url])

  const handle_open_in_cursor = useCallback(() => {
    if (!path) return
    try {
      const filesystem_path = convert_url_path_to_filesystem_path(path)
      window.location.href = `cursor://file/${filesystem_path}`
    } catch (error) {
      console.error('Failed to open file in Cursor:', error)
    }
    set_is_menu_open(false)
  }, [path])

  const handle_share_link = useCallback(() => {
    set_is_menu_open(false)
    set_is_share_dialog_open(true)
  }, [])

  useEffect(() => {
    if (!is_menu_open) return

    const handle_click_outside = (e) => {
      if (
        menu_node.current &&
        !menu_node.current.contains(e.target) &&
        container_ref.current &&
        !container_ref.current.contains(e.target)
      ) {
        set_is_menu_open(false)
      }
    }

    const handle_escape = (e) => {
      if (e.key === 'Escape') {
        set_is_menu_open(false)
      }
    }

    document.addEventListener('mousedown', handle_click_outside)
    document.addEventListener('keydown', handle_escape)
    return () => {
      document.removeEventListener('mousedown', handle_click_outside)
      document.removeEventListener('keydown', handle_escape)
    }
  }, [is_menu_open])

  if (!content) return null

  const copy_description = is_markdown
    ? 'Copy page as Markdown for LLMs'
    : 'Copy raw file content to clipboard'

  const view_description = is_markdown
    ? 'View this page as plain text'
    : 'View raw file content in browser'

  const menu_item_sx = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    width: '100%',
    height: 48,
    px: 2,
    py: 0,
    textAlign: 'left',
    justifyContent: 'flex-start',
    transition: 'background-color 0.15s ease',
    '&:hover': {
      backgroundColor: 'action.hover'
    }
  }

  const icon_container_sx = {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    backgroundColor: 'action.hover',
    flexShrink: 0
  }

  const title_sx = {
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.4
  }

  const subtitle_sx = {
    fontSize: '0.75rem',
    color: 'text.secondary',
    lineHeight: 1.4
  }

  const dropdown_menu =
    is_menu_open && menu_position
      ? ReactDOM.createPortal(
          <Box
            ref={menu_ref}
            sx={{
              position: 'fixed',
              top: menu_position.top,
              bottom: menu_position.bottom,
              right: menu_position.right,
              minWidth: 280,
              backgroundColor: 'background.paper',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              zIndex: 1300,
              animation: 'copy-page-menu-enter 0.15s ease',
              '@keyframes copy-page-menu-enter': {
                from: {
                  opacity: 0,
                  transform:
                    menu_position.placement === 'above'
                      ? 'translateY(4px)'
                      : 'translateY(-4px)'
                },
                to: { opacity: 1, transform: 'translateY(0)' }
              }
            }}>
            <ButtonBase onClick={handle_copy} sx={menu_item_sx}>
              <Box sx={icon_container_sx}>
                {is_copied ? (
                  <CheckIcon sx={{ fontSize: 18, color: '#28a745' }} />
                ) : (
                  <ContentCopyOutlinedIcon sx={{ fontSize: 18 }} />
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={title_sx}>{is_copied ? 'Copied' : 'Copy page'}</Box>
                <Box sx={subtitle_sx}>{copy_description}</Box>
              </Box>
            </ButtonBase>

            <ButtonBase onClick={handle_view_raw} sx={menu_item_sx}>
              <Box sx={icon_container_sx}>
                <OpenInNewIcon sx={{ fontSize: 18 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ ...title_sx, display: 'inline' }}>
                  {view_label}{' '}
                  <Box component='span' sx={{ fontWeight: 400 }}>
                    &#8599;
                  </Box>
                </Box>
                <Box sx={subtitle_sx}>{view_description}</Box>
              </Box>
            </ButtonBase>

            {path && (
              <ButtonBase onClick={handle_open_in_cursor} sx={menu_item_sx}>
                <Box sx={icon_container_sx}>
                  <CursorLogo size={18} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ ...title_sx, display: 'inline' }}>
                    Open in Cursor{' '}
                    <Box component='span' sx={{ fontWeight: 400 }}>
                      &#8599;
                    </Box>
                  </Box>
                  <Box sx={subtitle_sx}>Edit this file in Cursor</Box>
                </Box>
              </ButtonBase>
            )}

            {can_share && (
              <ButtonBase onClick={handle_share_link} sx={menu_item_sx}>
                <Box sx={icon_container_sx}>
                  <LinkIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={title_sx}>Share link</Box>
                  <Box sx={subtitle_sx}>
                    Generate a read-only share URL
                  </Box>
                </Box>
              </ButtonBase>
            )}
          </Box>,
          document.body
        )
      : null

  return (
    <>
    <Box ref={container_ref} sx={{ display: 'inline-flex' }}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
        <ButtonBase
          onClick={handle_copy}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            pl: 1.5,
            pr: 1,
            py: 0.625,
            fontSize: '0.8125rem',
            transition: 'background-color 0.15s ease',
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'action.hover'
            }
          }}>
          {is_copied ? (
            <CheckIcon sx={{ fontSize: 16, color: '#28a745' }} />
          ) : (
            <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
          )}
          <span>{is_copied ? 'Copied' : 'Copy page'}</span>
        </ButtonBase>
        <Box
          sx={{
            width: '1px',
            height: 20,
            backgroundColor: COLORS.border,
            flexShrink: 0
          }}
        />
        <ButtonBase
          onClick={handle_toggle_menu}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 0.5,
            py: 0.625,
            transition: 'background-color 0.15s ease',
            backgroundColor: is_menu_open ? 'action.selected' : 'transparent',
            '&:hover': {
              backgroundColor: 'action.hover'
            }
          }}>
          {is_menu_open ? (
            <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
          ) : (
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          )}
        </ButtonBase>
      </Box>
      {dropdown_menu}
    </Box>
    {can_share && (
      <ShareLinkDialog
        open={is_share_dialog_open}
        on_close={() => set_is_share_dialog_open(false)}
        entity_id={entity_id}
        title={entity_title}
      />
    )}
    </>
  )
}

CopyPageButton.propTypes = {
  path: PropTypes.string,
  content: PropTypes.string,
  entity_id: PropTypes.string,
  entity_title: PropTypes.string,
  entity_owner_key: PropTypes.string
}

export default CopyPageButton
