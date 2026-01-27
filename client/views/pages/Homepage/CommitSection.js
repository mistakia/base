import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import { get_is_committing } from '@core/git/selectors'

const CommitSection = ({
  repo_path,
  staged_count,
  write_allowed = false,
  is_merging = false,
  ours_branch,
  theirs_branch
}) => {
  const dispatch = useDispatch()
  const is_committing = useSelector(get_is_committing)
  const prev_is_merging = useRef(is_merging)

  // Generate default merge message
  const default_merge_message =
    is_merging && theirs_branch
      ? `Merge branch '${theirs_branch}' into ${ours_branch || 'current'}`
      : ''

  const [commit_message, set_commit_message] = useState(default_merge_message)

  // Update commit message when transitioning into merge state
  useEffect(() => {
    if (is_merging && theirs_branch && !prev_is_merging.current) {
      set_commit_message(default_merge_message)
    }
    prev_is_merging.current = is_merging
  }, [is_merging, theirs_branch, default_merge_message])

  const handle_commit = () => {
    if (!commit_message.trim() || !write_allowed) return

    dispatch(
      git_actions.commit({
        repo_path,
        message: commit_message.trim()
      })
    )
    set_commit_message('')
  }

  const handle_key_down = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handle_commit()
    }
  }

  // Don't render commit section if no write permission
  // Show when merging (even with 0 staged) or when there are staged files
  if (!write_allowed || (staged_count === 0 && !is_merging)) return null

  const button_label = is_committing
    ? 'Committing...'
    : is_merging
      ? 'Complete Merge'
      : `Commit (${staged_count})`

  const placeholder = is_merging
    ? 'Merge commit message...'
    : 'Commit message...'

  return (
    <div className='commit-section'>
      <textarea
        className='commit-section__input'
        placeholder={placeholder}
        value={commit_message}
        onChange={(e) => set_commit_message(e.target.value)}
        onKeyDown={handle_key_down}
        rows={2}
      />
      <div className='commit-section__footer'>
        <span className='commit-section__hint'>
          {is_merging
            ? 'Complete merge with Cmd/Ctrl+Enter'
            : 'Cmd/Ctrl+Enter to commit'}
        </span>
        <button
          className='commit-section__button'
          onClick={handle_commit}
          disabled={!commit_message.trim() || is_committing}>
          {button_label}
        </button>
      </div>
    </div>
  )
}

CommitSection.propTypes = {
  repo_path: PropTypes.string.isRequired,
  staged_count: PropTypes.number.isRequired,
  write_allowed: PropTypes.bool,
  is_merging: PropTypes.bool,
  ours_branch: PropTypes.string,
  theirs_branch: PropTypes.string
}

export default CommitSection
