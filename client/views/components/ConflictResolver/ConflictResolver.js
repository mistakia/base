import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import { Box, CircularProgress, Alert } from '@mui/material'

import { git_actions } from '@core/git/actions'
import {
  get_conflict_versions,
  get_is_loading_conflict_versions,
  get_is_resolving_conflict,
  get_git_error
} from '@core/git/selectors'
import ThreeWayDiffPanel from './ThreeWayDiffPanel.js'
import ConflictResolutionActions from './ConflictResolutionActions.js'

import './ConflictResolver.styl'

const ConflictResolver = ({
  repo_path,
  file_path,
  compact = false,
  on_resolved
}) => {
  const dispatch = useDispatch()
  const [hovered_resolution, set_hovered_resolution] = useState(null)
  // Track when THIS component initiated a resolution
  const [is_awaiting_resolution, set_is_awaiting_resolution] = useState(false)

  const conflict_data = useSelector((state) =>
    get_conflict_versions(state, repo_path, file_path)
  )
  const is_loading = useSelector(get_is_loading_conflict_versions)
  const is_resolving = useSelector(get_is_resolving_conflict)
  const error = useSelector(get_git_error)

  useEffect(() => {
    if (repo_path && file_path) {
      dispatch(git_actions.load_conflict_versions({ repo_path, file_path }))
    }
  }, [dispatch, repo_path, file_path])

  // Detect when resolution completes for THIS component's initiated resolution
  useEffect(() => {
    if (is_awaiting_resolution && !is_resolving && !conflict_data) {
      set_is_awaiting_resolution(false)
      on_resolved?.()
    }
  }, [is_awaiting_resolution, is_resolving, conflict_data, on_resolved])

  const handle_resolve = (resolution) => {
    set_is_awaiting_resolution(true)
    dispatch(
      git_actions.resolve_conflict({
        repo_path,
        file_path,
        resolution
      })
    )
  }

  if (is_loading && !conflict_data) {
    return (
      <Box
        className='conflict-resolver conflict-resolver--loading'
        sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error && !conflict_data) {
    return (
      <Box className='conflict-resolver' sx={{ p: 2 }}>
        <Alert severity='error'>
          Failed to load conflict data: {error.message || error}
        </Alert>
      </Box>
    )
  }

  if (!conflict_data) {
    return (
      <Box className='conflict-resolver' sx={{ p: 2 }}>
        <Alert severity='warning'>
          Unable to load conflict data for this file.
        </Alert>
      </Box>
    )
  }

  const { ours, theirs, base, ours_branch, theirs_branch } = conflict_data

  return (
    <Box
      className={`conflict-resolver ${compact ? 'conflict-resolver--compact' : ''}`}>
      <ThreeWayDiffPanel
        ours_content={ours}
        theirs_content={theirs}
        base_content={base}
        ours_branch={ours_branch}
        theirs_branch={theirs_branch}
        file_path={file_path}
        highlighted_panel={hovered_resolution}
      />

      <ConflictResolutionActions
        ours_branch={ours_branch}
        theirs_branch={theirs_branch}
        on_resolve={handle_resolve}
        is_resolving={is_resolving}
        on_hover={set_hovered_resolution}
      />
    </Box>
  )
}

ConflictResolver.propTypes = {
  repo_path: PropTypes.string.isRequired,
  file_path: PropTypes.string.isRequired,
  compact: PropTypes.bool,
  on_resolved: PropTypes.func
}

export default ConflictResolver
