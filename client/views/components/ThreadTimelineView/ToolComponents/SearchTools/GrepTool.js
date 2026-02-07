import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { Search as SearchIcon } from '@mui/icons-material'
import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled/index.js'
import { build_dual_tone_header } from '@components/ThreadTimelineView/ToolComponents/shared/title-utils.js'
import { get_shared_prefix } from '../../../../../utils/path-utils.js'

const GrepTool = ({ tool_call_event, tool_result_event }) => {
  const [show_results, set_show_results] = useState(false)
  const get_search_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const pattern = params.pattern || 'unknown pattern'
    const path = params.path || ''
    const output_mode = params.output_mode || 'files_with_matches'
    const case_sensitive = !params['-i']
    const context_lines = params['-C'] || params['-A'] || params['-B'] || 0
    const glob = params.glob || ''
    const type = params.type || ''

    return {
      pattern,
      path,
      output_mode,
      case_sensitive,
      context_lines,
      glob,
      type
    }
  }

  const parse_search_results = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result || ''

    if (typeof result !== 'string') {
      return { files: [], file_matches: {}, total_matches: 0 }
    }

    const trimmed = result.trim()
    if (/^no files? found$/i.test(trimmed)) {
      return { files: [], file_matches: {}, total_matches: 0 }
    }

    const lines = trimmed.split('\n').filter((line) => line.trim())

    // Handle summary header like: "Found 13 files"
    if (/^found\s+\d+\s+files?$/i.test(lines[0])) {
      const files_only = lines.slice(1)
      return { files: files_only, file_matches: {}, total_matches: 0 }
    }

    // General parsing: either file list, or file:line:content matches
    const file_matches = {}
    const files = new Set()
    let total_matches = 0
    const match_with_line_and_col_regex = /^(.+?):(\d+):(\d+):(.+)$/
    const match_with_line_regex = /^(.+?):(\d+):(.+)$/

    for (const line of lines) {
      let match = match_with_line_and_col_regex.exec(line)
      if (match) {
        const file_path = match[1]
        const content = match[4]
        files.add(file_path)
        if (!file_matches[file_path]) file_matches[file_path] = []
        file_matches[file_path].push({ line: content.trim(), full: line })
        total_matches++
        continue
      }

      match = match_with_line_regex.exec(line)
      if (match) {
        const file_path = match[1]
        const content = match[3]
        files.add(file_path)
        if (!file_matches[file_path]) file_matches[file_path] = []
        file_matches[file_path].push({ line: content.trim(), full: line })
        total_matches++
        continue
      }

      // Treat bare absolute paths (e.g., /Users/...) as files
      if (line.startsWith('/')) {
        files.add(line)
        continue
      }

      // Fallback: ignore unrecognized summary lines
    }

    return { files: Array.from(files), file_matches, total_matches }
  }

  const highlight_pattern = (text, pattern) => {
    if (!pattern || !text) return text

    try {
      const regex = new RegExp(`(${pattern})`, 'gi')
      const parts = text.split(regex)

      return parts.map((part, index) =>
        regex.test(part) ? (
          <Box
            key={index}
            component='span'
            sx={{
              bgcolor: 'warning.light',
              color: 'warning.contrastText',
              px: 0.5,
              borderRadius: 0.5,
              fontWeight: 'bold'
            }}>
            {part}
          </Box>
        ) : (
          part
        )
      )
    } catch {
      return text
    }
  }

  const render_search_results = () => {
    const search_results = parse_search_results()
    if (!search_results) return null

    const { files, file_matches } = search_results
    const { pattern } = get_search_info()

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

    // compute shared prefix so we only show unique suffixes
    const all_paths =
      Object.keys(file_matches).length > 0 ? Object.keys(file_matches) : files
    const shared_prefix = get_shared_prefix(all_paths)

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
        {Object.keys(file_matches).length > 0 ? (
          <Box>
            {Object.entries(file_matches).map(([file_path, matches]) => (
              <Box key={file_path} sx={{ mb: 1 }}>
                <Box
                  sx={{
                    fontFamily: 'Monaco, Menlo, monospace',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    mb: 0.5,
                    whiteSpace: 'nowrap'
                  }}>
                  {file_path.replace(shared_prefix, '')}
                </Box>
                <List dense sx={{ p: 0 }}>
                  {matches.map((match, idx) => (
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
                          fontSize: '11px',
                          lineHeight: 1.4,
                          whiteSpace: 'nowrap'
                        }}>
                        {highlight_pattern(match.line, pattern)}
                      </span>
                    </ListItem>
                  ))}
                </List>
              </Box>
            ))}
          </Box>
        ) : (
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
        )}
      </Box>
    )
  }

  const { pattern } = get_search_info()
  const search_results = parse_search_results()

  const action_button = (() => {
    if (!search_results) return null
    const has_results =
      (search_results.files?.length || 0) > 0 ||
      (search_results.total_matches || 0) > 0
    if (!has_results) return null
    const label = show_results
      ? 'hide'
      : search_results.total_matches && search_results.total_matches > 0
        ? `${search_results.total_matches} matches`
        : `${search_results.files.length} files`
    return {
      label,
      onClick: () => set_show_results(!show_results)
    }
  })()

  const header_node = build_dual_tone_header({
    left_label: 'Grep',
    right_label: `"${pattern}"`,
    action_button
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<SearchIcon fontSize='small' />}
      header={header_node}>
      {show_results && <Box>{render_search_results()}</Box>}
    </BaseToolComponent>
  )
}

GrepTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default GrepTool
