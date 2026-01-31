import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import { git_actions } from '@core/git/actions'
import {
  get_file_at_ref,
  get_file_content,
  get_is_loading_file_at_ref_for_key,
  get_is_loading_file_content_for_key
} from '@core/git/selectors'
import { use_discard_confirm } from '@views/hooks/use-discard-confirm'
import ConflictResolver from '@views/components/ConflictResolver/index.js'
import DiffViewer from '@views/components/DiffViewer/index.js'

// Status display configuration
const STATUS_CONFIG = {
  modified: { class: 'file-change-card__status--modified', letter: 'M' },
  added: { class: 'file-change-card__status--added', letter: 'A' },
  deleted: { class: 'file-change-card__status--deleted', letter: 'D' },
  untracked: { class: 'file-change-card__status--untracked', letter: '?' },
  renamed: { class: 'file-change-card__status--renamed', letter: 'R' },
  conflict: { class: 'file-change-card__status--conflict', letter: 'C' }
}

const FileChangeCard = ({
  file,
  repo_path,
  relative_repo_path,
  on_stage,
  on_unstage,
  on_discard,
  write_allowed = false
}) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [is_expanded, set_is_expanded] = useState(false)

  // Get original content from HEAD
  const file_at_ref_data = useSelector((state) =>
    get_file_at_ref(state, repo_path, file.path, 'HEAD')
  )
  // Get current content from working copy
  const file_content_data = useSelector((state) =>
    get_file_content(state, repo_path, file.path)
  )
  const is_loading_original = useSelector((state) =>
    get_is_loading_file_at_ref_for_key(state, repo_path, file.path, 'HEAD')
  )
  const is_loading_current = useSelector((state) =>
    get_is_loading_file_content_for_key(state, repo_path, file.path)
  )

  const file_url =
    relative_repo_path != null
      ? `/${[relative_repo_path, file.path].filter(Boolean).join('/')}`
      : null

  const discard_callback = useCallback(() => {
    on_discard(file.path)
  }, [on_discard, file.path])

  const { is_confirming: is_discard_confirming, handle_discard_click } =
    use_discard_confirm({ on_discard: discard_callback })

  const handle_toggle = () => {
    if (!is_expanded) {
      // Load original content (HEAD) and current content (working copy) when expanding
      if (!file_at_ref_data) {
        dispatch(
          git_actions.load_file_at_ref({
            repo_path,
            file_path: file.path,
            ref: 'HEAD'
          })
        )
      }
      if (!file_content_data) {
        dispatch(
          git_actions.load_file_content({
            repo_path,
            file_path: file.path
          })
        )
      }
    }
    set_is_expanded(!is_expanded)
  }

  const handle_open = (e) => {
    e.stopPropagation()
    if (!file_url) return
    // Cmd/Ctrl+click opens in new tab
    if (e.metaKey || e.ctrlKey) {
      window.open(file_url, '_blank')
    } else {
      navigate(file_url)
    }
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

  const handle_discard = (e) => {
    e.stopPropagation()
    if (!write_allowed) return
    handle_discard_click()
  }

  const handle_conflict_resolved = useCallback(() => {
    // Refresh git status to update the file list after conflict resolution
    dispatch(git_actions.load_git_status(repo_path))
    set_is_expanded(false)
  }, [dispatch, repo_path])

  const status_config = STATUS_CONFIG[file.status] || { class: '', letter: '?' }

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
          className={`file-change-card__status ${status_config.class}`}
          title={file.status}>
          {status_config.letter}
        </span>
        <span className='file-change-card__path' title={file.path}>
          {file.path}
        </span>
        <div className='file-change-card__actions'>
          {file_url && (
            <button
              className='file-change-card__action-button'
              onClick={handle_open}
              title='Open file (Cmd/Ctrl+click for new tab)'>
              open
            </button>
          )}
          {write_allowed && (
            <>
              {file.status !== 'untracked' && file.status !== 'added' && (
                <button
                  className={`file-change-card__action-button file-change-card__action-button--danger${is_discard_confirming ? ' file-change-card__action-button--confirming' : ''}`}
                  onClick={handle_discard}
                  title={
                    is_discard_confirming
                      ? 'Click again to confirm discard'
                      : 'Discard changes'
                  }>
                  {is_discard_confirming ? 'confirm' : 'discard'}
                </button>
              )}
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
            </>
          )}
        </div>
      </div>

      {is_expanded && (
        <div className='file-change-card__body'>
          {file.change_type === 'conflict' ? (
            <ConflictResolver
              repo_path={repo_path}
              file_path={file.path}
              compact={true}
              on_resolved={handle_conflict_resolved}
            />
          ) : file.status === 'untracked' || file.status === 'added' ? (
            <div className='file-change-card__new-file'>New file</div>
          ) : file.status === 'deleted' ? (
            <div className='file-change-card__deleted'>File deleted</div>
          ) : (
            <DiffViewer
              original_content={file_at_ref_data?.content ?? ''}
              current_content={file_content_data?.content ?? ''}
              file_path={file.path}
              is_redacted={
                file_at_ref_data?.is_redacted || file_content_data?.is_redacted
              }
              is_loading={
                (is_loading_original && !file_at_ref_data) ||
                (is_loading_current && !file_content_data)
              }
            />
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
  relative_repo_path: PropTypes.string,
  on_stage: PropTypes.func.isRequired,
  on_unstage: PropTypes.func.isRequired,
  on_discard: PropTypes.func.isRequired,
  write_allowed: PropTypes.bool
}

export default React.memo(FileChangeCard)
