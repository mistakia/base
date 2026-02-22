import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { Box, Collapse, IconButton, Typography } from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material'

import { COLORS } from '@theme/colors.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import TwoCellRow from '@components/MetadataDisplay/TwoCellRow.js'
import LabeledCell from '@components/MetadataDisplay/LabeledCell.js'

const format_date = (date_string) => {
  if (!date_string) return '-'
  try {
    const date = new Date(date_string)
    if (isNaN(date.getTime())) return '-'
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ]
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  } catch {
    return '-'
  }
}

const format_number = (num) => {
  if (num === null || num === undefined) return '-'
  return num.toLocaleString()
}

const GitRepoInfo = ({ statistics, is_loading, compact = false, repo_path }) => {
  const [expanded, set_expanded] = useState(false)

  if (is_loading) {
    return (
      <Box
        sx={{
          mt: 2,
          border: `1px solid ${COLORS.border_light}`,
          borderBottom: 'none',
          backgroundColor: 'white',
          p: 2
        }}>
        <Typography
          variant='body2'
          sx={{ color: COLORS.text_secondary, fontSize: '13px' }}>
          Loading repository info...
        </Typography>
      </Box>
    )
  }

  if (!statistics) {
    return null
  }

  const { total_commits, branch_count, last_commit, first_commit } = statistics

  const commits_link = repo_path ? `/${repo_path}/commits` : '/commits'
  const last_commit_display = last_commit ? (
    <>
      {format_relative_time(last_commit.date) || '-'} (
      <Link
        to={commits_link}
        onClick={(e) => e.stopPropagation()}
        style={{
          color: '#0969da',
          textDecoration: 'none'
        }}>
        {last_commit.short_hash}
      </Link>
      )
    </>
  ) : (
    '-'
  )

  const first_commit_display = first_commit
    ? format_date(first_commit.date)
    : '-'

  const toggle_expanded = () => set_expanded(!expanded)

  return (
    <Box
      sx={{
        mt: 2,
        border: `1px solid ${COLORS.border_light}`,
        borderBottom: 'none',
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px',
        backgroundColor: 'white'
      }}>
      {/* Row 1: Total Commits | Branches */}
      <TwoCellRow
        left_label='Total Commits'
        left_value={format_number(total_commits)}
        right_label='Branches'
        right_value={format_number(branch_count)}
        is_first={true}
        compact={compact}
        border_style='compact'
      />

      {/* Row 2: Last Commit | First Commit */}
      <TwoCellRow
        left_label='Last Commit'
        left_value={last_commit_display}
        right_label='First Commit'
        right_value={first_commit_display}
        compact={compact}
        border_style='compact'
      />

      {/* Expandable section for last commit details */}
      {last_commit && (last_commit.subject || last_commit.body) && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.5,
              py: 0.5,
              borderTop: `1px solid ${COLORS.border_light}`,
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.02)'
              }
            }}
            onClick={toggle_expanded}>
            <IconButton size='small' sx={{ mr: 0.5, p: 0.25 }}>
              {expanded ? (
                <ExpandLessIcon sx={{ fontSize: 18 }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
            <Typography
              variant='body2'
              sx={{
                fontSize: '12px',
                color: COLORS.text_secondary,
                fontWeight: 500
              }}>
              Last Commit Details
            </Typography>
          </Box>

          <Collapse in={expanded}>
            <Box
              sx={{
                borderTop: `1px solid ${COLORS.border_light}`,
                backgroundColor: COLORS.background_light || '#fafafa'
              }}>
              {/* Subject */}
              <Box
                sx={{
                  display: 'flex',
                  minHeight: compact ? '40px' : '48px'
                }}>
                <LabeledCell
                  label='Subject'
                  value={last_commit.subject || '-'}
                  compact={compact}
                />
              </Box>

              {/* Body (if present) */}
              {last_commit.body && (
                <Box
                  sx={{
                    display: 'flex',
                    minHeight: compact ? '40px' : '48px',
                    borderTop: `1px solid ${COLORS.border_light}`
                  }}>
                  <LabeledCell
                    label='Body'
                    value={
                      <Box
                        component='pre'
                        sx={{
                          margin: 0,
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                        {last_commit.body}
                      </Box>
                    }
                    compact={compact}
                  />
                </Box>
              )}

              {/* Author */}
              <Box
                sx={{
                  display: 'flex',
                  minHeight: compact ? '40px' : '48px',
                  borderTop: `1px solid ${COLORS.border_light}`
                }}>
                <LabeledCell
                  label='Author'
                  value={last_commit.author || '-'}
                  compact={compact}
                />
              </Box>
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  )
}

GitRepoInfo.propTypes = {
  statistics: PropTypes.shape({
    total_commits: PropTypes.number,
    branch_count: PropTypes.number,
    last_commit: PropTypes.shape({
      hash: PropTypes.string,
      short_hash: PropTypes.string,
      subject: PropTypes.string,
      body: PropTypes.string,
      date: PropTypes.string,
      author: PropTypes.string
    }),
    first_commit: PropTypes.shape({
      hash: PropTypes.string,
      short_hash: PropTypes.string,
      date: PropTypes.string
    })
  }),
  is_loading: PropTypes.bool,
  compact: PropTypes.bool,
  repo_path: PropTypes.string
}

export default GitRepoInfo
