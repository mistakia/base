import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import {
  get_repos_with_changes,
  get_total_changed_files_count,
  get_is_loading_status,
  get_is_committing,
  get_file_diff,
  get_is_loading_diff
} from '@core/git/selectors'
import './HomeFileChanges.styl'

// ============================================================================
// FileChangeCard Sub-component
// ============================================================================

const FileChangeCard = ({
  file,
  repo_path,
  on_stage,
  on_unstage,
  write_allowed
}) => {
  const dispatch = useDispatch()
  const [is_expanded, set_is_expanded] = useState(false)
  const diff = useSelector((state) =>
    get_file_diff(state, repo_path, file.path)
  )
  const is_loading_diff = useSelector(get_is_loading_diff)

  const handle_toggle = () => {
    if (!is_expanded && !diff) {
      // Load diff when expanding
      dispatch(
        git_actions.load_git_diff({
          repo_path,
          file_path: file.path,
          staged: file.change_type === 'staged'
        })
      )
    }
    set_is_expanded(!is_expanded)
  }

  const handle_stage = (e) => {
    e.stopPropagation()
    if (!write_allowed) return
    on_stage(file.path)
  }

  const handle_unstage = (e) => {
    e.stopPropagation()
    if (!write_allowed) return
    on_unstage(file.path)
  }

  // Get status badge color class
  const get_status_class = () => {
    switch (file.status) {
      case 'modified':
        return 'file-change-card__status--modified'
      case 'added':
        return 'file-change-card__status--added'
      case 'deleted':
        return 'file-change-card__status--deleted'
      case 'untracked':
        return 'file-change-card__status--untracked'
      default:
        return ''
    }
  }

  // Get status letter
  const get_status_letter = () => {
    switch (file.status) {
      case 'modified':
        return 'M'
      case 'added':
        return 'A'
      case 'deleted':
        return 'D'
      case 'untracked':
        return '?'
      case 'renamed':
        return 'R'
      default:
        return '?'
    }
  }

  return (
    <div className='file-change-card'>
      <div
        className='file-change-card__header'
        onClick={handle_toggle}
        role='button'
        tabIndex={0}
        aria-expanded={is_expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handle_toggle()
          }
        }}>
        <span className='file-change-card__toggle'>
          {is_expanded ? '-' : '+'}
        </span>
        <span
          className={`file-change-card__status ${get_status_class()}`}
          title={file.status}>
          {get_status_letter()}
        </span>
        <span className='file-change-card__path' title={file.path}>
          {file.path}
        </span>
        {write_allowed && (
          <div className='file-change-card__actions'>
            {file.change_type === 'staged' ? (
              <button
                className='file-change-card__action-button'
                onClick={handle_unstage}
                title='Unstage file'>
                unstage
              </button>
            ) : (
              <button
                className='file-change-card__action-button file-change-card__action-button--primary'
                onClick={handle_stage}
                title='Stage file'>
                stage
              </button>
            )}
          </div>
        )}
      </div>

      {is_expanded && (
        <div className='file-change-card__body'>
          {is_loading_diff && !diff ? (
            <div className='file-change-card__loading'>Loading diff...</div>
          ) : diff?.hunks?.length > 0 ? (
            <div className='file-change-card__diff'>
              {diff.hunks.map((hunk, index) => (
                <div key={index} className='diff-hunk'>
                  <div className='diff-hunk__header'>{hunk.header}</div>
                  <div className='diff-hunk__lines'>
                    {hunk.lines.map((line, line_index) => (
                      <div
                        key={line_index}
                        className={`diff-line diff-line--${line.type}`}>
                        <span className='diff-line__content'>
                          {line.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : file.status === 'untracked' || file.status === 'added' ? (
            <div className='file-change-card__new-file'>New file</div>
          ) : file.status === 'deleted' ? (
            <div className='file-change-card__deleted'>File deleted</div>
          ) : (
            <div className='file-change-card__no-diff'>
              No changes to display
            </div>
          )}
        </div>
      )}
    </div>
  )
}

FileChangeCard.propTypes = {
  file: PropTypes.shape({
    path: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    change_type: PropTypes.string.isRequired
  }).isRequired,
  repo_path: PropTypes.string.isRequired,
  on_stage: PropTypes.func.isRequired,
  on_unstage: PropTypes.func.isRequired,
  write_allowed: PropTypes.bool
}

FileChangeCard.defaultProps = {
  write_allowed: false
}

// ============================================================================
// CommitSection Sub-component
// ============================================================================

const CommitSection = ({ repo_path, staged_count, write_allowed }) => {
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

CommitSection.defaultProps = {
  write_allowed: false
}

// ============================================================================
// RepoSection Sub-component
// ============================================================================

const RepoSection = ({ repo }) => {
  const dispatch = useDispatch()
  const [is_collapsed, set_is_collapsed] = useState(true)

  const all_files = [
    ...(repo.staged || []).map((f) => ({ ...f, change_type: 'staged' })),
    ...(repo.unstaged || []).map((f) => ({ ...f, change_type: 'unstaged' })),
    ...(repo.untracked || []).map((f) => ({ ...f, change_type: 'untracked' }))
  ]

  const staged_count = repo.staged?.length || 0
  const unstaged_count = repo.unstaged?.length || 0
  const untracked_count = repo.untracked?.length || 0
  const total_count = staged_count + unstaged_count + untracked_count
  const write_allowed = repo.write_allowed === true

  const handle_stage = (file_path) => {
    if (!write_allowed) return
    dispatch(
      git_actions.stage_files({
        repo_path: repo.repo_path,
        files: [file_path]
      })
    )
  }

  const handle_unstage = (file_path) => {
    if (!write_allowed) return
    dispatch(
      git_actions.unstage_files({
        repo_path: repo.repo_path,
        files: [file_path]
      })
    )
  }

  const handle_stage_all = () => {
    if (!write_allowed) return
    const files_to_stage = [
      ...(repo.unstaged || []).map((f) => f.path),
      ...(repo.untracked || []).map((f) => f.path)
    ]
    if (files_to_stage.length > 0) {
      dispatch(
        git_actions.stage_files({
          repo_path: repo.repo_path,
          files: files_to_stage
        })
      )
    }
  }

  return (
    <div className='repo-section'>
      <div
        className='repo-section__header'
        onClick={() => set_is_collapsed(!is_collapsed)}
        role='button'
        tabIndex={0}
        aria-expanded={!is_collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            set_is_collapsed(!is_collapsed)
          }
        }}>
        <span className='repo-section__toggle'>{is_collapsed ? '+' : '-'}</span>
        <span className='repo-section__name'>{repo.repo_name}</span>
        <span className='repo-section__branch'>{repo.branch}</span>
        <span className='repo-section__count'>{total_count}</span>
        {write_allowed &&
          !is_collapsed &&
          unstaged_count + untracked_count > 0 && (
            <button
              className='repo-section__stage-all'
              onClick={(e) => {
                e.stopPropagation()
                handle_stage_all()
              }}>
              stage all
            </button>
          )}
      </div>

      {!is_collapsed && (
        <div className='repo-section__content'>
          <div className='repo-section__files'>
            {all_files.map((file) => (
              <FileChangeCard
                key={`${file.change_type}-${file.path}`}
                file={file}
                repo_path={repo.repo_path}
                on_stage={handle_stage}
                on_unstage={handle_unstage}
                write_allowed={write_allowed}
              />
            ))}
          </div>
          <CommitSection
            repo_path={repo.repo_path}
            staged_count={staged_count}
            write_allowed={write_allowed}
          />
        </div>
      )}
    </div>
  )
}

RepoSection.propTypes = {
  repo: PropTypes.shape({
    repo_path: PropTypes.string.isRequired,
    repo_name: PropTypes.string.isRequired,
    branch: PropTypes.string.isRequired,
    write_allowed: PropTypes.bool,
    staged: PropTypes.arrayOf(
      PropTypes.shape({
        path: PropTypes.string.isRequired,
        status: PropTypes.string.isRequired
      })
    ),
    unstaged: PropTypes.arrayOf(
      PropTypes.shape({
        path: PropTypes.string.isRequired,
        status: PropTypes.string.isRequired
      })
    ),
    untracked: PropTypes.arrayOf(
      PropTypes.shape({
        path: PropTypes.string.isRequired,
        status: PropTypes.string.isRequired
      })
    )
  }).isRequired
}

// ============================================================================
// Main HomeFileChanges Component
// ============================================================================

const HomeFileChanges = () => {
  const dispatch = useDispatch()
  const repos_with_changes = useSelector(get_repos_with_changes)
  const total_count = useSelector(get_total_changed_files_count)
  const is_loading = useSelector(get_is_loading_status)
  const [is_collapsed, set_is_collapsed] = useState(true)

  useEffect(() => {
    dispatch(git_actions.load_git_status_all())
  }, [dispatch])

  // Don't render if no changes
  if (!is_loading && repos_with_changes.length === 0) {
    return null
  }

  return (
    <div className='home-file-changes'>
      <div
        className='home-section-header home-section-header--clickable'
        onClick={() => set_is_collapsed(!is_collapsed)}
        role='button'
        tabIndex={0}
        aria-expanded={!is_collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            set_is_collapsed(!is_collapsed)
          }
        }}>
        <span className='home-section-header__toggle'>
          {is_collapsed ? '+' : '-'}
        </span>
        <span className='home-section-header__dot home-section-header__dot--changes' />
        <span className='home-section-header__title'>File Changes</span>
        <span className='home-section-header__count'>
          {is_loading ? '...' : total_count}
        </span>
      </div>

      {!is_collapsed && (
        <div className='home-file-changes__content'>
          {is_loading && repos_with_changes.length === 0 ? (
            <div className='home-file-changes__loading'>
              Loading repository status...
            </div>
          ) : (
            repos_with_changes.map((repo) => (
              <RepoSection key={repo.repo_path} repo={repo} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default HomeFileChanges
