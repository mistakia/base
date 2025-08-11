import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { render_markdown } from '@views/utils/markdown-renderer.js'

const MarkdownViewer = ({ content }) => {
  const html_content = useMemo(() => {
    if (!content) return ''
    return render_markdown(content)
  }, [content])

  return (
    <Box
      sx={{
        '& h1': { fontSize: '1.25rem', fontWeight: 600, mb: 1.5, mt: 2 },
        '& h2': { fontSize: '1.125rem', fontWeight: 600, mb: 1.2, mt: 1.7 },
        '& h3': { fontSize: '1rem', fontWeight: 600, mb: 1, mt: 1.5 },
        '& h4': { fontSize: '0.95rem', fontWeight: 600, mb: 0.8, mt: 1.2 },
        '& h5': { fontSize: '0.9rem', fontWeight: 600, mb: 0.7, mt: 1 },
        '& h6': { fontSize: '0.85rem', fontWeight: 600, mb: 0.7, mt: 1 },
        '& p': { mb: 1, lineHeight: 1.6 },
        '& ul, & ol': { mb: 1.5, pl: 3 },
        '& ul': { listStyle: 'none' },
        '& ul li': { position: 'relative' },
        '& ul li::before': {
          content: '"- "',
          position: 'absolute',
          left: '-1.2em'
        },
        '& li': { mb: 0.5 },
        '& pre': {
          backgroundColor: 'var(--color-code-bg)',
          p: 2,
          borderRadius: 1,
          overflow: 'visible',
          mb: 2,
          fontSize: '0.875rem',
          fontFamily: 'var(--font-family-mono)',
          border: '1px solid var(--color-code-border)'
        },
        '& code': {
          backgroundColor: 'var(--color-code-bg)',
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          fontSize: '0.875em',
          fontFamily: 'var(--font-family-mono)',
          border: '1px solid var(--color-code-border)'
        },
        '& pre code': {
          backgroundColor: 'transparent',
          border: 'none',
          px: 0,
          py: 0
        },
        '& a': {
          color: '#0366d6',
          textDecoration: 'none',
          '&:hover': { textDecoration: 'underline' }
        },
        '& blockquote': {
          borderLeft: '4px solid #dfe2e5',
          pl: 2,
          ml: 0,
          color: '#6a737d',
          fontStyle: 'italic'
        },
        '& table': {
          width: '100%',
          borderCollapse: 'collapse',
          mb: 2
        },
        '& th, & td': {
          border: '1px solid #dfe2e5',
          px: 1.5,
          py: 1,
          textAlign: 'left'
        },
        '& th': {
          backgroundColor: 'var(--color-code-bg)',
          fontWeight: 600
        }
      }}
      dangerouslySetInnerHTML={{ __html: html_content }}
    />
  )
}

MarkdownViewer.propTypes = {
  content: PropTypes.string.isRequired
}

export default MarkdownViewer
