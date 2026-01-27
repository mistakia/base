import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import { get_is_committing } from '@core/git/selectors'

const CommitSection = ({ repo_path, staged_count, write_allowed = false }) => {
  const dispatch = useDispatch()
  const is_committing = useSelector(get_is_committing)
  const [commit_message, set_commit_message] = useState('')

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

  // Don't render commit section if no staged files or no write permission
  if (staged_count === 0 || !write_allowed) return null

  return (
    <div className='commit-section'>
      <textarea
        className='commit-section__input'
        placeholder='Commit message...'
        value={commit_message}
        onChange={(e) => set_commit_message(e.target.value)}
        onKeyDown={handle_key_down}
        rows={2}
      />
      <div className='commit-section__footer'>
        <span className='commit-section__hint'>Cmd/Ctrl+Enter to commit</span>
        <button
          className='commit-section__button'
          onClick={handle_commit}
          disabled={!commit_message.trim() || is_committing}>
          {is_committing ? 'Committing...' : `Commit (${staged_count})`}
        </button>
      </div>
    </div>
  )
}

CommitSection.propTypes = {
  repo_path: PropTypes.string.isRequired,
  staged_count: PropTypes.number.isRequired,
  write_allowed: PropTypes.bool
}

export default CommitSection
