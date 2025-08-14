import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'
import EntityFrontmatter from './EntityFrontmatter/index.js'

const EntityRenderer = ({ frontmatter, markdown, is_redacted }) => {
  const left_content = markdown ? (
    <Box sx={{ pr: 2 }}>
      <MarkdownViewer content={markdown} is_redacted={is_redacted} />
    </Box>
  ) : null

  const right_content = frontmatter ? (
    <EntityFrontmatter
      frontmatter={frontmatter}
      is_sticky={Boolean(markdown)}
    />
  ) : null

  // If there's no markdown content, center the frontmatter
  if (!markdown && frontmatter) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ maxWidth: '600px', width: '100%' }}>
          <EntityFrontmatter frontmatter={frontmatter} is_sticky={false} />
        </Box>
      </Box>
    )
  }

  return (
    <TwoColumnLayout
      left_content={left_content}
      right_content={right_content}
      left_column_width={8}
      right_column_width={4}
      container_padding={3}
      sticky_right={true}
    />
  )
}

EntityRenderer.propTypes = {
  frontmatter: PropTypes.object,
  markdown: PropTypes.string,
  is_redacted: PropTypes.bool
}

export default EntityRenderer
