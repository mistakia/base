import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  CircularProgress
} from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import PageLayout from '@views/layout/PageLayout.js'
import PageHead from '@views/components/PageHead/index.js'
import CommitDetail from '@components/CommitDetail/index.js'
import Button from '@components/primitives/Button/index.js'
import { commits_actions } from '@core/commits/actions'
import {
  get_commits_list,
  get_is_loading_commits,
  get_commits_page,
  get_commits_total_pages,
  get_commits_total_count,
  get_commits_repo_name,
  get_commits_branch,
  get_commit_detail,
  get_is_loading_commit_detail
} from '@core/commits/selectors'

const CommitsPage = ({ repo_path }) => {
  const dispatch = useDispatch()
  const commits = useSelector(get_commits_list)
  const is_loading = useSelector(get_is_loading_commits)
  const page = useSelector(get_commits_page)
  const total_pages = useSelector(get_commits_total_pages)
  const total_count = useSelector(get_commits_total_count)
  const repo_name = useSelector(get_commits_repo_name)
  const branch = useSelector(get_commits_branch)
  const commit_detail = useSelector(get_commit_detail)
  const is_loading_detail = useSelector(get_is_loading_commit_detail)

  const [expanded_hash, set_expanded_hash] = useState(null)
  const [page_input, set_page_input] = useState('')

  useEffect(() => {
    dispatch(commits_actions.load_commits({ repo_path }))
  }, [dispatch, repo_path])

  const go_to_page = (new_page) => {
    if (new_page >= 1 && new_page <= total_pages && new_page !== page) {
      set_expanded_hash(null)
      dispatch(commits_actions.load_commits({ repo_path, page: new_page }))
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

  const handle_toggle_detail = (hash) => {
    if (expanded_hash === hash) {
      set_expanded_hash(null)
    } else {
      set_expanded_hash(hash)
      dispatch(commits_actions.load_commit_detail({ repo_path, hash }))
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

  const display_name = repo_name || repo_path || 'Repository'

  return (
    <>
      <PageHead title={`Commits - ${display_name}`} />
      <PageLayout>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          {/* Header */}
          <Box sx={{ mb: 2, mt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mt: 1
              }}>
              <Typography variant='h6' sx={{ fontWeight: 600 }}>
                Commits
              </Typography>
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
            </Box>
          </Box>

          {/* Loading state */}
          {is_loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {/* Commits list */}
          {!is_loading && commits.length > 0 && (
            <TableContainer
              sx={{
                border: `1px solid ${COLORS.border_light}`,
                borderRadius: 0,
                backgroundColor: 'white',
                maxWidth: '100%'
              }}>
              <Table size='small' sx={{ tableLayout: 'fixed' }}>
                <TableBody>
                  {commits.map((commit) => (
                    <React.Fragment key={commit.hash}>
                      <TableRow
                        hover
                        onClick={() => handle_toggle_detail(commit.hash)}
                        sx={{
                          cursor: 'pointer',
                          '&:last-child td': { borderBottom: 0 },
                          ...(expanded_hash === commit.hash && {
                            backgroundColor: 'rgba(0,0,0,0.02)'
                          })
                        }}>
                        <TableCell
                          sx={{
                            width: 80,
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: COLORS.info,
                            py: 1.5
                          }}>
                          {commit.short_hash}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: '13px',
                            py: 1.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                          {commit.subject}
                        </TableCell>
                        <TableCell
                          sx={{
                            width: 120,
                            fontSize: '12px',
                            color: COLORS.text_secondary,
                            py: 1.5,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                          {commit.author_name}
                        </TableCell>
                        <TableCell
                          sx={{
                            width: 100,
                            fontSize: '12px',
                            color: COLORS.text_secondary,
                            py: 1.5,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                          {format_relative_time(commit.date)}
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail */}
                      {expanded_hash === commit.hash && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            sx={{ p: 0, borderBottom: 0, overflow: 'hidden' }}>
                            <CommitDetail
                              detail={
                                commit_detail?.hash === commit.hash
                                  ? commit_detail
                                  : null
                              }
                              is_loading={is_loading_detail}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Empty state */}
          {!is_loading && commits.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant='body2' sx={{ color: COLORS.text_secondary }}>
                No commits found
              </Typography>
            </Box>
          )}

          {/* Pagination controls */}
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
                {total_count} commits
              </span>
            </Box>
          )}
        </div>
      </PageLayout>
    </>
  )
}

CommitsPage.propTypes = {
  repo_path: PropTypes.string
}

export default CommitsPage
