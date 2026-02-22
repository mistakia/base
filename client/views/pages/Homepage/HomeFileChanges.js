import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { git_actions } from '@core/git/actions'
import {
  get_repos_with_changes,
  get_total_changed_files_count,
  get_is_loading_status
} from '@core/git/selectors'
import HelpTooltip from '@components/primitives/HelpTooltip.js'
import RepoSection from './RepoSection.js'
import './HomeFileChanges.styl'

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
        <HelpTooltip title='Files that have been added, edited, or removed since the last commit (saved version). Click to see details.'>
          <span className='home-section-header__title'>File Changes</span>
        </HelpTooltip>
        <HelpTooltip title='The total number of files with uncommitted changes across all projects. These changes have not been saved into a commit yet.'>
          <span className='home-section-header__count'>
            {is_loading ? '...' : total_count}
          </span>
        </HelpTooltip>
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

export default React.memo(HomeFileChanges)
