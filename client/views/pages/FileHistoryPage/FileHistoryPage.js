import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import { Box, Typography, CircularProgress } from '@mui/material'
import { FileDiff } from '@pierre/diffs/react'
import { parsePatchFiles } from '@pierre/diffs'

import { COLORS } from '@theme/colors.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import PageLayout from '@views/layout/PageLayout.js'
import PageHead from '@views/components/PageHead/index.js'
import Button from '@components/primitives/Button/index.js'
import { file_history_actions } from '@core/file-history/actions.js'
import {
  get_file_history_commits,
  get_is_loading_file_history,
  get_file_history_page,
  get_file_history_total_pages,
  get_file_history_total_count,
  get_file_history_count_capped,
  get_file_history_repo_name,
  get_file_history_branch,
  get_file_history_current_path,
  get_file_history_error
} from '@core/file-history/selectors.js'

const status_labels = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied'
}

const status_colors = {
  A: '#2da44e',
  M: '#bf8700',
  D: '#cf222e',
  R: '#8250df',
  C: '#0969da'
}

const diff_options = {
  layout: 'unified',
  themes: {
    light: 'github-light',
    dark: 'github-dark'
  },
  themeType: 'light',
  lineNumbers: true,
  wordWrap: true,
  unsafeCSS: `
    pre {
      font-size: 11px !important;
      line-height: 1.4 !important;
    }
  `
}

const CommitCard = ({ commit, repo_name, show_rename_from, options_ref }) => {
  const parsed_files = useMemo(() => {
    if (!commit.diff) return []
    try {
      const patches = parsePatchFiles(commit.diff)
      return patches.flatMap((patch) => patch.files)
    } catch {
      return []
    }
  }, [commit.diff])

  const full_commit_href = repo_name
    ? `/${repo_name}/commits#${commit.hash}`
    : null

  return (
    <Box
      sx={{
        border: `1px solid ${COLORS.border_light}`,
        backgroundColor: 'white',
        mb: 2,
        overflow: 'hidden'
      }}>
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${COLORS.border_light}`,
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap'
        }}>
        <Typography
          variant='caption'
          sx={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: COLORS.info,
            fontWeight: 600
          }}>
          {commit.short_hash}
        </Typography>
        <Typography
          variant='body2'
          sx={{ fontWeight: 600, fontSize: '13px', flex: 1, minWidth: 0 }}>
          {commit.subject}
        </Typography>
        <Typography
          variant='caption'
          sx={{
            fontWeight: 600,
            fontSize: '11px',
            color: status_colors[commit.status] || COLORS.text_secondary
          }}>
          {status_labels[commit.status] || commit.status}
        </Typography>
        <Typography
          variant='caption'
          sx={{ color: COLORS.text_secondary, fontSize: '12px' }}>
          {commit.author_name}
        </Typography>
        <Typography
          variant='caption'
          sx={{ color: COLORS.text_secondary, fontSize: '12px' }}>
          {format_relative_time(commit.date)}
        </Typography>
      </Box>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: `1px solid ${COLORS.border_light}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap'
        }}>
        <Typography
          variant='caption'
          sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {commit.path_at_commit || '(unknown path)'}
        </Typography>
        {show_rename_from && (
          <Typography
            variant='caption'
            sx={{ color: '#8250df', fontSize: '11px', fontWeight: 600 }}>
            renamed at this commit
          </Typography>
        )}
        {full_commit_href && (
          <Typography
            component='a'
            href={full_commit_href}
            variant='caption'
            sx={{
              fontSize: '11px',
              color: COLORS.info,
              textDecoration: 'none',
              ml: 'auto',
              '&:hover': { textDecoration: 'underline' }
            }}>
            View full commit
          </Typography>
        )}
      </Box>
      {commit.is_binary && (
        <Box sx={{ p: 2 }}>
          <Typography
            variant='body2'
            sx={{ color: COLORS.text_secondary, fontSize: '12px' }}>
            Binary file changed - diff not shown.
          </Typography>
        </Box>
      )}
      {!commit.is_binary && commit.truncated && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography
            variant='body2'
            sx={{ color: COLORS.text_secondary, fontSize: '12px' }}>
            Diff truncated - open the full commit to see the complete patch.
          </Typography>
        </Box>
      )}
      {!commit.is_binary && parsed_files.length > 0 && (
        <Box sx={{ overflow: 'auto', maxHeight: 600, maxWidth: '100%' }}>
          {parsed_files.map((file_diff, index) => (
            <FileDiff
              key={file_diff.name || index}
              fileDiff={file_diff}
              options={options_ref}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

CommitCard.propTypes = {
  commit: PropTypes.shape({
    hash: PropTypes.string,
    short_hash: PropTypes.string,
    subject: PropTypes.string,
    author_name: PropTypes.string,
    date: PropTypes.string,
    path_at_commit: PropTypes.string,
    status: PropTypes.string,
    diff: PropTypes.string,
    is_binary: PropTypes.bool,
    truncated: PropTypes.bool
  }).isRequired,
  repo_name: PropTypes.string,
  show_rename_from: PropTypes.bool,
  options_ref: PropTypes.object.isRequired
}

const FileHistoryPage = ({ base_uri }) => {
  const dispatch = useDispatch()
  const commits = useSelector(get_file_history_commits)
  const is_loading = useSelector(get_is_loading_file_history)
  const page = useSelector(get_file_history_page)
  const total_pages = useSelector(get_file_history_total_pages)
  const total_count = useSelector(get_file_history_total_count)
  const count_capped = useSelector(get_file_history_count_capped)
  const repo_name = useSelector(get_file_history_repo_name)
  const branch = useSelector(get_file_history_branch)
  const current_path = useSelector(get_file_history_current_path)
  const error = useSelector(get_file_history_error)

  const options_ref = useRef(diff_options).current
  const [page_input, set_page_input] = useState('')

  useEffect(() => {
    if (base_uri) {
      dispatch(file_history_actions.load_file_history({ base_uri }))
    }
  }, [dispatch, base_uri])

  const go_to_page = (new_page) => {
    if (new_page >= 1 && new_page <= total_pages && new_page !== page) {
      dispatch(
        file_history_actions.load_file_history({ base_uri, page: new_page })
      )
    }
  }

  const handle_page_input_submit = (e) => {
    e.preventDefault()
    const target_page = parseInt(page_input, 10)
    if (target_page >= 1 && target_page <= total_pages) {
      go_to_page(target_page)
      set_page_input('')
    }
  }

  const get_page_numbers = () => {
    const pages = []
    const start = Math.max(1, page - 2)
    const end = Math.min(total_pages, page + 2)
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  const display_name = current_path || base_uri

  return (
    <>
      <PageHead title={`History - ${display_name}`} />
      <PageLayout>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <Box sx={{ mb: 2, mt: 1 }}>
            <Typography variant='h6' sx={{ fontWeight: 600 }}>
              File History
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mt: 1,
                flexWrap: 'wrap'
              }}>
              <Typography
                variant='body2'
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {base_uri}
              </Typography>
              {repo_name && (
                <Typography
                  variant='body2'
                  sx={{
                    fontSize: '12px',
                    color: COLORS.text_secondary,
                    backgroundColor: COLORS.surface_secondary,
                    px: 1,
                    py: 0.25,
                    fontFamily: 'monospace'
                  }}>
                  {repo_name}
                </Typography>
              )}
              {branch && (
                <Typography
                  variant='body2'
                  sx={{
                    fontSize: '12px',
                    color: COLORS.text_secondary,
                    backgroundColor: COLORS.surface_secondary,
                    px: 1,
                    py: 0.25,
                    fontFamily: 'monospace'
                  }}>
                  {branch}
                </Typography>
              )}
              {current_path && (
                <Typography
                  variant='body2'
                  sx={{
                    fontSize: '12px',
                    color: COLORS.text_secondary,
                    fontFamily: 'monospace'
                  }}>
                  {current_path}
                </Typography>
              )}
            </Box>
          </Box>

          {is_loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {!is_loading && error && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant='body2' sx={{ color: COLORS.text_secondary }}>
                Failed to load file history.
              </Typography>
            </Box>
          )}

          {!is_loading && !error && commits.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant='body2' sx={{ color: COLORS.text_secondary }}>
                No commits found for this file.
              </Typography>
            </Box>
          )}

          {!is_loading &&
            commits.length > 0 &&
            commits.map((commit, index) => {
              const prev_path_at_commit =
                index + 1 < commits.length
                  ? commits[index + 1].path_at_commit
                  : null
              const show_rename_from =
                prev_path_at_commit !== null &&
                prev_path_at_commit !== commit.path_at_commit
              return (
                <CommitCard
                  key={commit.hash}
                  commit={commit}
                  repo_name={repo_name}
                  show_rename_from={show_rename_from}
                  options_ref={options_ref}
                />
              )
            })}

          {total_pages > 1 && !is_loading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                mt: 2,
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
              <Button
                size='small'
                variant='secondary'
                disabled={page <= 1}
                onClick={() => go_to_page(1)}>
                First
              </Button>
              <Button
                size='small'
                variant='secondary'
                disabled={page <= 1}
                onClick={() => go_to_page(page - 1)}>
                Prev
              </Button>
              {get_page_numbers().map((p) => (
                <Button
                  key={p}
                  size='small'
                  variant={p === page ? 'primary' : 'secondary'}
                  onClick={() => go_to_page(p)}>
                  {p}
                </Button>
              ))}
              <Button
                size='small'
                variant='secondary'
                disabled={page >= total_pages}
                onClick={() => go_to_page(page + 1)}>
                Next
              </Button>
              <Button
                size='small'
                variant='secondary'
                disabled={page >= total_pages}
                onClick={() => go_to_page(total_pages)}>
                Last
              </Button>

              <form
                onSubmit={handle_page_input_submit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '8px'
                }}>
                <input
                  type='number'
                  min={1}
                  max={total_pages}
                  value={page_input}
                  onChange={(e) => set_page_input(e.target.value)}
                  placeholder={`${page}`}
                  style={{
                    width: '48px',
                    padding: '2px 4px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    border: `1px solid ${COLORS.border}`,
                    textAlign: 'center'
                  }}
                />
                <span style={{ color: COLORS.text_secondary }}>
                  / {total_pages}
                </span>
              </form>

              <span
                style={{
                  color: COLORS.text_tertiary,
                  marginLeft: '8px',
                  fontSize: '11px'
                }}>
                {total_count}
                {count_capped ? '+' : ''} commits
              </span>
            </Box>
          )}
        </div>
      </PageLayout>
    </>
  )
}

FileHistoryPage.propTypes = {
  base_uri: PropTypes.string.isRequired
}

export default FileHistoryPage
