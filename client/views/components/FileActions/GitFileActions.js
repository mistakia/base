import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box, Tooltip, ButtonBase, CircularProgress } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'

import { git_actions } from '@core/git/actions'
import {
  get_is_auto_committing,
  get_file_change_status
} from '@core/git/selectors'
import { use_discard_confirm } from '@views/hooks/use-discard-confirm'

const StageIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'>
    <path
      d='M12 5V19M5 12H19'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
    />
  </svg>
)

const icon_prop_types = { size: PropTypes.number }

StageIcon.propTypes = icon_prop_types

const RevertIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'>
    <path
      d='M4 7H14C17.3137 7 20 9.68629 20 13C20 16.3137 17.3137 19 14 19H4'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path
      d='M8 3L4 7L8 11'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
)

RevertIcon.propTypes = icon_prop_types

const CommitIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'>
    <path
      d='M5 13L9 17L19 7'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
)

CommitIcon.propTypes = icon_prop_types

const GitFileActions = ({ git_context }) => {
  const dispatch = useDispatch()
  const is_auto_committing = useSelector(get_is_auto_committing)

  const repo_path = git_context?.repo_path
  const relative_path = git_context?.relative_path
  const status = git_context?.status

  // Read live change status from git repo state (updates after stage/unstage)
  const change_status = useSelector((state) =>
    get_file_change_status(state, repo_path, relative_path)
  )
  const is_staged = change_status === 'staged'

  const on_discard = useCallback(() => {
    dispatch(git_actions.discard_files({ repo_path, files: [relative_path] }))
  }, [dispatch, repo_path, relative_path])

  const { is_confirming, handle_discard_click } = use_discard_confirm({
    on_discard
  })

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
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 1,
    transition: 'background-color 0.15s ease',
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: 'action.hover'
    }
  }

  const show_discard = status !== 'untracked' && status !== 'added'

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {show_discard && (
        <Tooltip
          title={
            is_confirming
              ? 'Click again to confirm discard'
              : 'Discard changes'
          }>
          <ButtonBase
            onClick={handle_discard_click}
            sx={{
              ...button_sx,
              color: '#d73a49',
              ...(is_confirming && {
                backgroundColor: '#d73a49',
                color: '#fff',
                '&:hover': {
                  backgroundColor: '#b92d3a'
                }
              })
            }}>
            {is_confirming ? <CommitIcon size={16} /> : <RevertIcon size={16} />}
          </ButtonBase>
        </Tooltip>
      )}
      <Tooltip title={is_staged ? 'Unstage file' : 'Stage file'}>
        <ButtonBase
          onClick={handle_stage_toggle}
          sx={{
            ...button_sx,
            color: is_staged ? '#f66a0a' : '#007bff'
          }}>
          <StageIcon size={16} />
        </ButtonBase>
      </Tooltip>
      <Tooltip title='Stage and commit with auto-generated message'>
        <span>
          <ButtonBase
            onClick={handle_auto_commit}
            disabled={is_auto_committing}
            sx={{
              ...button_sx,
              color: 'text.secondary',
              opacity: is_auto_committing ? 0.6 : 1
            }}>
            {is_auto_committing ? (
              <CircularProgress size={14} sx={{ color: 'text.secondary' }} />
            ) : (
              <CommitIcon size={16} />
            )}
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
    ])
  })
}

export default GitFileActions
