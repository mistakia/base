import React from 'react'
import PropTypes from 'prop-types'
import { Box, Tooltip, ButtonBase } from '@mui/material'

// Git diff icon based on https://www.svgrepo.com/svg/508074/git-diff
const GitDiffIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'>
    <path
      d='M6 6C6 7.10457 5.10457 8 4 8C2.89543 8 2 7.10457 2 6C2 4.89543 2.89543 4 4 4C5.10457 4 6 4.89543 6 6Z'
      stroke='currentColor'
      strokeWidth='1.5'
    />
    <path
      d='M22 18C22 19.1046 21.1046 20 20 20C18.8954 20 18 19.1046 18 18C18 16.8954 18.8954 16 20 16C21.1046 16 22 16.8954 22 18Z'
      stroke='currentColor'
      strokeWidth='1.5'
    />
    <path
      d='M22 6C22 7.10457 21.1046 8 20 8C18.8954 8 18 7.10457 18 6C18 4.89543 18.8954 4 20 4C21.1046 4 22 4.89543 22 6Z'
      stroke='currentColor'
      strokeWidth='1.5'
    />
    <path
      d='M6 18C6 19.1046 5.10457 20 4 20C2.89543 20 2 19.1046 2 18C2 16.8954 2.89543 16 4 16C5.10457 16 6 16.8954 6 18Z'
      stroke='currentColor'
      strokeWidth='1.5'
    />
    <path d='M20 8V16' stroke='currentColor' strokeWidth='1.5' />
    <path d='M4 8V16' stroke='currentColor' strokeWidth='1.5' />
    <path
      d='M9 6H15'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
    />
    <path
      d='M12 3L12 9'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
    />
    <path
      d='M9 18H15'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
    />
  </svg>
)

GitDiffIcon.propTypes = {
  size: PropTypes.number
}

const FileDiffToggle = ({ git_context, is_active, on_toggle }) => {
  // Only show toggle if file has uncommitted changes
  if (!git_context?.status) {
    return null
  }

  const { additions = 0, deletions = 0 } = git_context

  const get_status_label = () => {
    switch (git_context.status) {
      case 'modified':
        return 'Modified'
      case 'added':
        return 'Added'
      case 'deleted':
        return 'Deleted'
      case 'untracked':
        return 'Untracked'
      default:
        return 'Changed'
    }
  }

  const tooltip_text = is_active
    ? 'Hide diff view'
    : `Show diff (${get_status_label()})`

  return (
    <Tooltip title={tooltip_text}>
      <ButtonBase
        onClick={on_toggle}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          fontSize: '0.8125rem',
          fontFamily: 'monospace',
          transition: 'background-color 0.15s ease',
          backgroundColor: is_active ? 'action.selected' : 'transparent',
          '&:hover': {
            backgroundColor: is_active ? 'action.selected' : 'action.hover'
          }
        }}>
        {deletions > 0 && (
          <Box
            component='span'
            sx={{
              color: 'error.main',
              fontWeight: 500
            }}>
            -{deletions}
          </Box>
        )}
        {additions > 0 && (
          <Box
            component='span'
            sx={{
              color: 'success.main',
              fontWeight: 500
            }}>
            +{additions}
          </Box>
        )}
        <Box
          component='span'
          sx={{
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary'
          }}>
          <GitDiffIcon size={16} />
        </Box>
      </ButtonBase>
    </Tooltip>
  )
}

FileDiffToggle.propTypes = {
  git_context: PropTypes.shape({
    repo_path: PropTypes.string,
    relative_path: PropTypes.string,
    status: PropTypes.oneOf([
      'modified',
      'added',
      'deleted',
      'untracked',
      null
    ]),
    is_staged: PropTypes.bool,
    additions: PropTypes.number,
    deletions: PropTypes.number
  }),
  is_active: PropTypes.bool,
  on_toggle: PropTypes.func.isRequired
}

export default FileDiffToggle
