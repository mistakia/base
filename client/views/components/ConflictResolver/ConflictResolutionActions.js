import React from 'react'
import PropTypes from 'prop-types'
import { Box, CircularProgress } from '@mui/material'

const ConflictResolutionActions = ({
  ours_branch,
  theirs_branch,
  on_resolve,
  is_resolving,
  on_hover
}) => (
  <Box className='conflict-resolution-actions'>
    <button
      className='conflict-resolution-actions__button conflict-resolution-actions__button--ours'
      onClick={() => on_resolve('ours')}
      onMouseEnter={() => on_hover?.('ours')}
      onMouseLeave={() => on_hover?.(null)}
      disabled={is_resolving}>
      {is_resolving ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
      Use {ours_branch || 'Current'}
    </button>

    <button
      className='conflict-resolution-actions__button conflict-resolution-actions__button--theirs'
      onClick={() => on_resolve('theirs')}
      onMouseEnter={() => on_hover?.('theirs')}
      onMouseLeave={() => on_hover?.(null)}
      disabled={is_resolving}>
      {is_resolving ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
      Use {theirs_branch || 'Incoming'}
    </button>
  </Box>
)

ConflictResolutionActions.propTypes = {
  ours_branch: PropTypes.string,
  theirs_branch: PropTypes.string,
  on_resolve: PropTypes.func.isRequired,
  is_resolving: PropTypes.bool,
  on_hover: PropTypes.func
}

export default ConflictResolutionActions
