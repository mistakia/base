import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import CodeViewer from '@components/primitives/CodeViewer.js'
import DiffCodeViewer from './DiffCodeViewer.js'
import { get_language_from_path } from '@views/utils/language-utils.js'

const DiffPanel = ({
  content,
  base_content,
  label,
  panel_type,
  language,
  is_highlighted
}) => {
  const class_names = [
    'three-way-diff__panel',
    `three-way-diff__panel--${panel_type}`,
    is_highlighted ? 'three-way-diff__panel--highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const diff_type = panel_type === 'ours' ? 'addition' : 'deletion'

  // Show diff highlighting for ours/theirs panels when base content is available
  const should_show_diff = panel_type !== 'base' && base_content

  return (
    <Box className={class_names}>
      <Box className='three-way-diff__header'>
        <span className='three-way-diff__indicator' />
        {label}
      </Box>
      <Box className='three-way-diff__content'>
        {content ? (
          should_show_diff ? (
            <DiffCodeViewer
              code={content}
              base_code={base_content}
              language={language || 'text'}
              diff_type={diff_type}
            />
          ) : (
            <CodeViewer code={content} language={language || 'text'} />
          )
        ) : (
          <Box className='three-way-diff__empty'>No content</Box>
        )}
      </Box>
    </Box>
  )
}

DiffPanel.propTypes = {
  content: PropTypes.string,
  base_content: PropTypes.string,
  label: PropTypes.string.isRequired,
  panel_type: PropTypes.oneOf(['ours', 'base', 'theirs']).isRequired,
  language: PropTypes.string,
  is_highlighted: PropTypes.bool
}

const ThreeWayDiffPanel = ({
  ours_content,
  theirs_content,
  base_content,
  ours_branch,
  theirs_branch,
  file_path,
  highlighted_panel
}) => {
  const language = get_language_from_path(file_path)

  return (
    <Box className='three-way-diff'>
      <DiffPanel
        content={ours_content}
        base_content={base_content}
        label={ours_branch || 'Current (Ours)'}
        panel_type='ours'
        language={language}
        is_highlighted={highlighted_panel === 'ours'}
      />

      <DiffPanel
        content={base_content}
        label='Base'
        panel_type='base'
        language={language}
      />

      <DiffPanel
        content={theirs_content}
        base_content={base_content}
        label={theirs_branch || 'Incoming (Theirs)'}
        panel_type='theirs'
        language={language}
        is_highlighted={highlighted_panel === 'theirs'}
      />
    </Box>
  )
}

ThreeWayDiffPanel.propTypes = {
  ours_content: PropTypes.string,
  theirs_content: PropTypes.string,
  base_content: PropTypes.string,
  ours_branch: PropTypes.string,
  theirs_branch: PropTypes.string,
  file_path: PropTypes.string,
  highlighted_panel: PropTypes.oneOf(['ours', 'theirs', null])
}

export default ThreeWayDiffPanel
