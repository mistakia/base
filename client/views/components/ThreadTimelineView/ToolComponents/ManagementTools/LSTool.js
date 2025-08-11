import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { List as ListIcon } from '@mui/icons-material'
import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'
import {
  build_dual_tone_header,
  format_relative_path
} from '@views/components/ThreadTimelineView/ToolComponents/shared/title-utils'

const LSTool = ({ tool_call_event, tool_result_event }) => {
  const [show_results, set_show_results] = useState(false)

  const get_list_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const path = params.path || 'unknown path'
    const ignore = params.ignore || []

    return { path, ignore }
  }

  const parse_list_results = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result || ''

    if (typeof result !== 'string') {
      return { items: [], directories: [], files: [], total_count: 0 }
    }

    // Parse the tree structure from LS tool output
    const lines = result.split('\n').filter((line) => line.trim())

    const items = []
    const directories = []
    const files = []

    lines.forEach((line) => {
      const trimmed = line.trim()

      // Skip empty lines or headers
      if (!trimmed || trimmed.includes('NOTE:')) return

      // Parse indented tree structure
      const depth = (line.length - line.trimStart().length) / 2
      const name = trimmed.replace(/^[└├─\s]+/, '').replace(/\/$/, '')

      if (!name) return

      const is_directory = trimmed.endsWith('/') || line.includes('/')

      items.push({
        name,
        path: line,
        depth,
        is_directory,
        original: line
      })

      if (is_directory) {
        directories.push(name)
      } else {
        files.push(name)
      }
    })

    return {
      items,
      directories,
      files,
      total_count: items.length
    }
  }

  const render_list_results = () => {
    const list_results = parse_list_results()
    if (!list_results) return null

    const { items, total_count } = list_results

    if (total_count === 0) {
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
            no items found
          </MonospaceText>
        </Box>
      )
    }

    // Build a tree structure from flat items using their depth
    const sanitize_item_name = (raw_name) => {
      if (!raw_name) return ''
      return raw_name.replace(/^[-•]\s+/, '')
    }

    const build_tree_nodes = (flat_items) => {
      const root = {
        name: '__root__',
        is_directory: true,
        depth: -1,
        children: []
      }
      const stack = [root]
      flat_items.forEach((it) => {
        const node = {
          name: sanitize_item_name(it.name),
          is_directory: !!it.is_directory,
          depth: it.depth,
          children: []
        }
        while (stack.length && stack[stack.length - 1].depth >= node.depth) {
          stack.pop()
        }
        const parent = stack[stack.length - 1] || root
        parent.children.push(node)
        stack.push(node)
      })
      return root.children
    }

    const build_tree_lines = (nodes, prefix_parts = []) => {
      const lines = []
      nodes.forEach((node, index) => {
        const is_last = index === nodes.length - 1
        const prefix = prefix_parts
          .map((ancestor_is_last) => (ancestor_is_last ? '    ' : '│   '))
          .join('')
        const branch = is_last ? '└── ' : '├── '
        const label = `${node.name}${node.is_directory ? '/' : ''}`
        lines.push(`${prefix}${branch}${label}`)
        if (node.children && node.children.length) {
          lines.push(
            ...build_tree_lines(node.children, [...prefix_parts, is_last])
          )
        }
      })
      return lines
    }

    const tree_nodes = build_tree_nodes(items)
    const lines = build_tree_lines(tree_nodes)

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
          {lines.map((line, idx) => (
            <ListItem
              key={idx}
              sx={{
                px: 1,
                py: 0,
                height: '22px',
                minHeight: '22px',
                alignItems: 'center'
              }}>
              <MonospaceText
                variant='xs'
                sx={{
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: '11px',
                  whiteSpace: 'pre',
                  color: 'var(--color-text-secondary)'
                }}>
                {line}
              </MonospaceText>
            </ListItem>
          ))}
        </List>
      </Box>
    )
  }

  const { path } = get_list_info()
  const list_results = parse_list_results()

  const action_button = (() => {
    if (!list_results) return null
    const has_results = (list_results.total_count || 0) > 0
    if (!has_results) return null
    const label = show_results ? 'hide' : `${list_results.total_count} items`
    return {
      label,
      onClick: () => set_show_results(!show_results)
    }
  })()

  const relative_path = format_relative_path({
    file_path: path,
    working_directory:
      '/Users/trashman/user-base/repository/active/mistakia/base-worktrees/feature-client-app-rebuild'
  })

  const header_node = build_dual_tone_header({
    left_label: 'List',
    right_label: relative_path || path,
    action_button
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<ListIcon fontSize='small' />}
      header={header_node}>
      {show_results && <Box>{render_list_results()}</Box>}
    </BaseToolComponent>
  )
}

LSTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default LSTool
