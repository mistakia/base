import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Button,
  CircularProgress
} from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import PageLayout from '@views/layout/PageLayout.js'
import PageHead from '@views/components/PageHead/index.js'
import CommitDetail from '@components/CommitDetail/index.js'
import { commits_actions } from '@core/commits/actions'
import {
  get_commits_list,
  get_is_loading_commits,
  get_is_loading_more_commits,
  get_has_more_commits,
  get_next_cursor,
  get_commits_repo_name,
  get_commits_branch,
  get_commit_detail,
  get_is_loading_commit_detail
} from '@core/commits/selectors'

const CommitsPage = ({ repo_path }) => {
  const dispatch = useDispatch()
  const commits = useSelector(get_commits_list)
  const is_loading = useSelector(get_is_loading_commits)
  const is_loading_more = useSelector(get_is_loading_more_commits)
  const has_more = useSelector(get_has_more_commits)
  const next_cursor = useSelector(get_next_cursor)
  const repo_name = useSelector(get_commits_repo_name)
  const branch = useSelector(get_commits_branch)
  const commit_detail = useSelector(get_commit_detail)
  const is_loading_detail = useSelector(get_is_loading_commit_detail)

  const [expanded_hash, set_expanded_hash] = useState(null)

  useEffect(() => {
    dispatch(commits_actions.load_commits({ repo_path }))
  }, [dispatch, repo_path])

  const handle_load_more = () => {
    if (next_cursor) {
      dispatch(commits_actions.load_more_commits({ repo_path, cursor: next_cursor }))
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

  const back_path = repo_path ? `/${repo_path}` : '/'
  const display_name = repo_name || repo_path || 'Repository'

  return (
    <>
      <PageHead title={`Commits - ${display_name}`} />
      <PageLayout>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          {/* Header */}
          <Box sx={{ mb: 2, mt: 1 }}>
            <Link
              to={back_path}
              style={{
                color: COLORS.text_secondary,
                fontSize: '13px',
                textDecoration: 'none'
              }}>
              {'<'} Back to {display_name}
            </Link>
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
                    backgroundColor: '#f0f0f0',
                    px: 1,
                    py: 0.25,
                    borderRadius: '4px',
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
                borderRadius: '6px',
                backgroundColor: 'white'
              }}>
              <Table size='small'>
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
                            color: '#0969da',
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
                          <TableCell colSpan={4} sx={{ p: 0, borderBottom: 0 }}>
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
              <Typography
                variant='body2'
                sx={{ color: COLORS.text_secondary }}>
                No commits found
              </Typography>
            </Box>
          )}

          {/* Load more button */}
          {has_more && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant='outlined'
                size='small'
                onClick={handle_load_more}
                disabled={is_loading_more}
                sx={{ textTransform: 'none' }}>
                {is_loading_more ? (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                ) : null}
                Load more commits
              </Button>
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
