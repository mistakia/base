import React from 'react'
import { Box } from '@mui/material'
import Button from '@views/components/primitives/Button/Button.js'
import { MonospaceText } from '@views/components/primitives/styled/index.js'

// Consolidated dual-tone header used by tools that need a simple "Label Value" header
// Example: left_label = "Grep", right_label = '"pattern"'
export const build_dual_tone_header = ({
  left_label,
  right_label,
  action_button
}) => {
  return (
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
          gap: 'var(--space-sm)',
          flexWrap: 'nowrap',
          minWidth: 0,
          flex: '1 1 auto'
        }}>
        <MonospaceText
          variant='sm'
          color='text.secondary'
          sx={{
            fontWeight: 500,
            fontSize: '12px',
            whiteSpace: 'nowrap',
            flex: '0 0 auto'
          }}>
          {left_label}
        </MonospaceText>
        <MonospaceText
          variant='sm'
          color='text.primary'
          sx={{
            fontWeight: 600,
            fontSize: '12px',
            overflowWrap: 'anywhere',
            wordBreak: 'break-all',
            whiteSpace: 'normal',
            maxWidth: '100%',
            flex: '1 1 auto',
            minWidth: 0
          }}>
          {right_label}
        </MonospaceText>
      </Box>
      {action_button && (
        <Button
          size='small'
          variant='ghost'
          onClick={action_button.onClick}
          className='title-utils-action-button'>
          {action_button.label}
        </Button>
      )}
    </Box>
  )
}

// Format a file path to be relative to the provided working directory
// If the file path is the same as the working directory, returns '.'
// If the working directory is missing or does not match, returns the original path
export const format_relative_path = ({ file_path, working_directory }) => {
  if (!file_path) return ''
  if (!working_directory) return file_path

  const normalize = (p) => p.replace(/\\/g, '/').replace(/\/+$/g, '')

  const wd = normalize(working_directory)
  const fp = file_path.replace(/\\/g, '/')

  if (fp === wd) return '.'
  if (fp.startsWith(`${wd}/`)) return fp.slice(wd.length + 1)
  if (fp.startsWith(wd)) {
    const rest = fp.slice(wd.length)
    return rest.startsWith('/') ? rest.slice(1) : rest || '.'
  }
  return file_path
}

// Format count-based labels with correct plurality
// Example: format_count_label({ count: 1, singular: 'Edit' }) -> '1 Edit'
//          format_count_label({ count: 2, singular: 'Edit' }) -> '2 Edits'
//          format_count_label({ count: 2, singular: 'Match', plural: 'Matches' }) -> '2 Matches'
export const format_count_label = ({ count, singular, plural }) => {
  const noun = count === 1 ? singular : plural || `${singular}s`
  return `${count} ${noun}`
}
