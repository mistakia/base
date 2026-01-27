import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import FileChangeCard from './FileChangeCard.js'
import CommitSection from './CommitSection.js'

// Change types in priority order (conflicts first)
const CHANGE_TYPES = [
  { key: 'conflicts', type: 'conflict' },
  { key: 'staged', type: 'staged' },
  { key: 'unstaged', type: 'unstaged' },
  { key: 'untracked', type: 'untracked' }
]

const RepoSection = ({ repo }) => {
  const dispatch = useDispatch()
  const [is_collapsed, set_is_collapsed] = useState(true)

  const all_files = CHANGE_TYPES.flatMap(({ key, type }) =>
    (repo[key] || []).map((f) => ({
      ...f,
      change_type: type,
      ...(type === 'conflict' && { status: 'conflict' })
    }))
  )

  const total_count = CHANGE_TYPES.reduce(
    (sum, { key }) => sum + (repo[key]?.length || 0),
    0
  )

  const staged_count = repo.staged?.length || 0
  const unstaged_count = repo.unstaged?.length || 0
  const untracked_count = repo.untracked?.length || 0
  const conflict_count = repo.conflicts?.length || 0

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
        {conflict_count > 0 && (
          <span className='repo-section__conflict-indicator'>
            {conflict_count} conflict{conflict_count > 1 ? 's' : ''}
          </span>
        )}
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
                relative_repo_path={repo.relative_repo_path}
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
    relative_repo_path: PropTypes.string,
    branch: PropTypes.string.isRequired,
    write_allowed: PropTypes.bool,
    conflicts: PropTypes.arrayOf(
      PropTypes.shape({
        path: PropTypes.string.isRequired,
        status: PropTypes.string
      })
    ),
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

export default RepoSection
