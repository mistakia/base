import React, { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import HelpTooltip from '@components/primitives/HelpTooltip.js'
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

  const is_merging = repo.is_merging === true
  const ours_branch = repo.ours_branch
  const theirs_branch = repo.theirs_branch

  const all_files = useMemo(
    () =>
      CHANGE_TYPES.flatMap(({ key, type }) =>
        (repo[key] || []).map((f) => ({
          ...f,
          change_type: type,
          ...(type === 'conflict' && { status: 'conflict' })
        }))
      ),
    [repo]
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

  const handle_stage = useCallback(
    (file_path) => {
      if (!write_allowed) return
      dispatch(
        git_actions.stage_files({
          repo_path: repo.repo_path,
          files: [file_path]
        })
      )
    },
    [dispatch, write_allowed, repo.repo_path]
  )

  const handle_unstage = useCallback(
    (file_path) => {
      if (!write_allowed) return
      dispatch(
        git_actions.unstage_files({
          repo_path: repo.repo_path,
          files: [file_path]
        })
      )
    },
    [dispatch, write_allowed, repo.repo_path]
  )

  const handle_stage_all = useCallback(() => {
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
  }, [dispatch, write_allowed, repo.repo_path, repo.unstaged, repo.untracked])

  const handle_discard = useCallback(
    (file_path) => {
      if (!write_allowed) return
      dispatch(
        git_actions.discard_files({
          repo_path: repo.repo_path,
          files: [file_path]
        })
      )
    },
    [dispatch, write_allowed, repo.repo_path]
  )

  const handle_abort_merge = useCallback(() => {
    if (!write_allowed) return
    dispatch(git_actions.abort_merge({ repo_path: repo.repo_path }))
  }, [dispatch, write_allowed, repo.repo_path])

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
        <HelpTooltip title='The name of the project (repository) where these file changes were found. A repository is a project folder that tracks the full history of its files through commits.'>
          <span className='repo-section__name'>
            {repo.is_worktree && repo.parent_repo_name && (
              <>
                <span className='repo-section__parent-repo-name'>
                  {repo.parent_repo_name}
                </span>
                {' / '}
              </>
            )}
            {repo.repo_name}
            {repo.is_worktree && (
              <HelpTooltip title='A worktree is a separate working copy of the same project, used to work on different things at the same time without mixing changes.'>
                <span className='repo-section__worktree-indicator'>
                  worktree
                </span>
              </HelpTooltip>
            )}
          </span>
        </HelpTooltip>
        <HelpTooltip title='The current branch -- a named line of work within this project. Different branches let you work on separate changes independently.'>
          <span className='repo-section__branch'>{repo.branch}</span>
        </HelpTooltip>
        {conflict_count > 0 && (
          <HelpTooltip title='Conflicts happen when two sets of changes affect the same part of a file. These need to be resolved manually before the changes can be committed (saved).'>
            <span className='repo-section__conflict-indicator'>
              {conflict_count} conflict{conflict_count > 1 ? 's' : ''}
            </span>
          </HelpTooltip>
        )}
        {is_merging && (
          <span className='repo-section__merge-indicator'>
            <span className='repo-section__merge-text'>
              Merging {theirs_branch || 'branch'} into{' '}
              {ours_branch || 'current'}
            </span>
            {write_allowed && (
              <button
                className='repo-section__abort-button'
                onClick={(e) => {
                  e.stopPropagation()
                  handle_abort_merge()
                }}>
                Abort
              </button>
            )}
          </span>
        )}
        <HelpTooltip title='The number of files with uncommitted changes in this project.'>
          <span className='repo-section__count'>{total_count}</span>
        </HelpTooltip>
        {write_allowed &&
          !is_collapsed &&
          unstaged_count + untracked_count > 0 && (
            <HelpTooltip title='Staging marks files as ready to be included in the next commit (saved version). "Stage all" selects every changed file at once.'>
              <button
                className='repo-section__stage-all'
                onClick={(e) => {
                  e.stopPropagation()
                  handle_stage_all()
                }}>
                stage all
              </button>
            </HelpTooltip>
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
                on_discard={handle_discard}
                write_allowed={write_allowed}
              />
            ))}
          </div>
          <CommitSection
            repo_path={repo.repo_path}
            staged_count={staged_count}
            write_allowed={write_allowed}
            is_merging={is_merging}
            ours_branch={ours_branch}
            theirs_branch={theirs_branch}
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
    is_worktree: PropTypes.bool,
    parent_repo_name: PropTypes.string,
    is_merging: PropTypes.bool,
    ours_branch: PropTypes.string,
    theirs_branch: PropTypes.string,
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

export default React.memo(RepoSection)
