import React from 'react'
import PropTypes from 'prop-types'
import { Box, Tooltip, ButtonBase, CircularProgress } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'

import { git_actions } from '@core/git/actions'
import {
  get_is_auto_committing,
  get_file_change_status
} from '@core/git/selectors'

const GitFileActions = ({ git_context }) => {
  const dispatch = useDispatch()
  const is_auto_committing = useSelector(get_is_auto_committing)

  const repo_path = git_context?.repo_path
  const relative_path = git_context?.relative_path

  // Read live change status from git repo state (updates after stage/unstage)
  const change_status = useSelector((state) =>
    get_file_change_status(state, repo_path, relative_path)
  )
  const is_staged = change_status === 'staged'

  // Show when git_context initially indicated changes, or file still has changes in git state
  if (!git_context?.status && !change_status) {
    return null
  }

  const handle_stage_toggle = () => {
    if (is_staged) {
      dispatch(git_actions.unstage_files({ repo_path, files: [relative_path] }))
    } else {
      dispatch(git_actions.stage_files({ repo_path, files: [relative_path] }))
    }
  }

  const handle_auto_commit = () => {
    dispatch(
      git_actions.auto_commit_file({ repo_path, file_path: relative_path })
    )
  }

  const button_sx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    px: 1,
    py: 0.5,
    borderRadius: 1,
    fontSize: '0.8125rem',
    fontFamily: 'monospace',
    transition: 'background-color 0.15s ease',
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: 'action.hover'
    }
  }

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={is_staged ? 'Unstage file' : 'Stage file'}>
        <ButtonBase onClick={handle_stage_toggle} sx={button_sx}>
          <Box
            component='span'
            sx={{
              display: 'flex',
              alignItems: 'center',
              color: is_staged ? 'warning.main' : 'success.main',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1
            }}>
            {is_staged ? '\u2212' : '+'}
          </Box>
          <Box component='span' sx={{ color: 'text.secondary' }}>
            {is_staged ? 'Unstage' : 'Stage'}
          </Box>
        </ButtonBase>
      </Tooltip>
      <Tooltip title='Stage and commit with auto-generated message'>
        <span>
          <ButtonBase
            onClick={handle_auto_commit}
            disabled={is_auto_committing}
            sx={{
              ...button_sx,
              opacity: is_auto_committing ? 0.6 : 1
            }}>
            {is_auto_committing ? (
              <CircularProgress size={14} sx={{ color: 'text.secondary' }} />
            ) : (
              <Box
                component='span'
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'text.secondary',
                  fontSize: '1rem',
                  lineHeight: 1
                }}>
                {'\u2713'}
              </Box>
            )}
            <Box component='span' sx={{ color: 'text.secondary' }}>
              Commit
            </Box>
          </ButtonBase>
        </span>
      </Tooltip>
    </Box>
  )
}

GitFileActions.propTypes = {
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
  })
}

export default GitFileActions
