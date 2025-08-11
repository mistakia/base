import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Button, List, ListItem } from '@mui/material'
import { FindInPage as GlobIcon } from '@mui/icons-material'
import BaseToolComponent from '../BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled/index.js'

const GlobTool = ({ tool_call_event, tool_result_event }) => {
  const [show_results, set_show_results] = useState(false)
  const get_glob_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const pattern = params.pattern || 'unknown pattern'
    const path = params.path || ''

    return { pattern, path }
  }

  const parse_glob_results = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result || ''

    if (typeof result !== 'string') {
      return { files: [], directories: [], total_count: 0 }
    }

    const lines = result.split('\n').filter((line) => line.trim())

    const files = []
    const directories = []

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (trimmed.endsWith('/')) {
        directories.push(trimmed.slice(0, -1))
      } else {
        files.push(trimmed)
      }
    })

    // Sort directories first, then files
    directories.sort()
    files.sort()

    return {
      files,
      directories,
      total_count: files.length + directories.length
    }
  }

  const render_glob_results = () => {
    const glob_results = parse_glob_results()
    if (!glob_results) return null

    const { files = [] } = glob_results

    if (files.length === 0) {
      return (
        <Box
          sx={{
            bgcolor: 'grey.50',
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 1,
            p: 1
          }}>
          <MonospaceText variant='sm' color='var(--color-text-secondary)'>
            no matches
          </MonospaceText>
        </Box>
      )
    }

    const get_shared_prefix = (paths) => {
      if (!paths || paths.length === 0) return ''
      const split_paths = paths.map((p) => p.split('/'))
      const shortest_len = Math.min(...split_paths.map((parts) => parts.length))
      const shared_parts = []
      for (let i = 0; i < shortest_len; i++) {
        const part = split_paths[0][i]
        if (split_paths.every((arr) => arr[i] === part)) {
          shared_parts.push(part)
        } else {
          break
        }
      }
      const prefix = shared_parts.join('/')
      return prefix.length > 0 ? `${prefix}/` : ''
    }

    const shared_prefix = get_shared_prefix(files)

    return (
      <Box
        sx={{
          bgcolor: 'grey.50',
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 1,
          p: 1,
          maxHeight: '300px',
          overflowY: 'auto',
          overflowX: 'auto'
        }}>
        <List dense sx={{ p: 0 }}>
          {files.map((file, idx) => (
            <ListItem
              key={idx}
              sx={{
                px: 1,
                py: 0,
                height: '30px',
                minHeight: '30px',
                alignItems: 'center'
              }}>
              <span
                style={{
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: '12px',
                  whiteSpace: 'nowrap'
                }}>
                {file.replace(shared_prefix, '')}
              </span>
            </ListItem>
          ))}
        </List>
      </Box>
    )
  }

  const { pattern } = get_glob_info()
  const glob_results = parse_glob_results()

  const header_node = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 'var(--space-xs)',
        mb: 'var(--space-sm)'
      }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-xs)',
          flexWrap: 'wrap'
        }}>
        <MonospaceText
          variant='sm'
          color='text.secondary'
          sx={{ fontWeight: 500 }}>
          Glob
        </MonospaceText>
        <MonospaceText
          variant='sm'
          color='text.primary'
          sx={{ fontWeight: 700 }}>
          {`"${pattern}"`}
        </MonospaceText>
      </Box>
      {(() => {
        if (!glob_results) return null
        const files_len = glob_results.files?.length || 0
        if (files_len === 0) return null
        const label = show_results ? 'hide' : `${files_len} files`
        return (
          <Button
            size='small'
            variant='text'
            onClick={() => set_show_results(!show_results)}
            sx={{
              fontSize: '10px',
              minWidth: 'auto',
              px: 1,
              py: 0.25,
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' }
            }}>
            {label}
          </Button>
        )
      })()}
    </Box>
  )

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<GlobIcon fontSize='small' />}
      header={header_node}>
      {show_results && <Box>{render_glob_results()}</Box>}
    </BaseToolComponent>
  )
}

GlobTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default GlobTool
