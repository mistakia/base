import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { FindInPage as GlobIcon } from '@mui/icons-material'

import Button from '@components/primitives/Button'
import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
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
      return { files: [], total_count: 0 }
    }

    const files = result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.endsWith('/'))
      .sort()

    return {
      files,
      total_count: files.length
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
          sx={{ fontWeight: 500, fontSize: '12px' }}>
          Glob
        </MonospaceText>
        <MonospaceText
          variant='sm'
          color='text.primary'
          sx={{ fontWeight: 600, fontSize: '12px' }}>
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
            variant='ghost'
            size='small'
            onClick={() => set_show_results(!show_results)}>
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
