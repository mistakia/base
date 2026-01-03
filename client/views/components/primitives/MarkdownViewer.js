import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { render_markdown } from '@views/utils/markdown-renderer.js'

import { COLORS } from '@theme/colors.js'
import '@styles/checkbox.styl'
import '@styles/plaintext-highlighting.styl'

const get_normal_styles = {
  '& h1': { fontSize: '1.25rem', fontWeight: 600, mb: 2, mt: 4 },
  '& h2': {
    fontSize: '1.125rem',
    fontWeight: 600,
    mb: 2,
    mt: 4
  },
  '& h3': { fontSize: '1rem', fontWeight: 600, mb: 1, mt: 2 },
  '& h4': {
    fontSize: '0.95rem',
    fontWeight: 600,
    mb: 1.5,
    mt: 3
  },
  '& h5': { fontSize: '0.9rem', fontWeight: 600, mb: 1, mt: 2 },
  '& h6': { fontSize: '0.85rem', fontWeight: 600, mb: 1, mt: 2 },
  '& p': { mb: 3, lineHeight: 1.4 },
  '& ul, & ol': { mb: 3, pl: 3 },
  '& ul ul': { m: 1, pl: 3 },
  '& ul': { listStyle: 'none' },
  '& ul li': { position: 'relative' },
  '& ul li::before': {
    content: '"- "',
    position: 'absolute',
    left: '-1.2em',
    color: 'var(--color-text-tertiary)'
  },
  '& li': { mb: 0.5, lineHeight: 1.4 },
  '& pre': {
    backgroundColor: COLORS.code_bg,
    p: '0 16px',
    borderRadius: 1,
    overflow: 'visible',
    mt: 2,
    mb: 2,
    fontSize: '0.875rem',
    fontFamily: 'var(--font-family-mono)',
    border: `1px solid ${COLORS.code_border}`
  },
  '& code': {
    backgroundColor: COLORS.code_bg,
    px: 0.5,
    py: 0.25,
    borderRadius: 0.5,
    fontSize: '0.875em',
    fontFamily: 'var(--font-family-mono)'
  },
  '& pre code': {
    backgroundColor: 'transparent',
    padding: '24px 0'
  },
  '& blockquote': {
    borderLeft: '2px solid var(--color-border)',
    padding: '9px 20px',
    margin: '1.25em 0',
    fontSize: '0.8rem',
    fontWeight: 300,
    lineHeight: 1.4,
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-sm)',
    '& p:first-of-type': {
      marginTop: '0'
    },
    '& p:last-of-type': {
      marginBottom: '0'
    },
    '& ul:last-of-type': {
      marginBottom: '0'
    }
  },
  '& a': {
    color: 'inherit',
    textDecoration: 'none',
    borderBottom: '1px dotted var(--color-primary)',
    cursor: 'pointer',
    transition: 'color 0.2s, border-bottom-color 0.2s',
    display: 'inline-block',
    lineHeight: '1.2',
    wordBreak: 'break-all'
  },
  '& a:hover': {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary-hover)'
  },
  '& hr': {
    border: 'none',
    borderTop: '1px solid var(--color-text-disabled)',
    margin: '1em 0',
    opacity: 0.7
  },
  '& .table-container': {
    overflowX: 'auto',
    margin: '0.75em 0',
    borderRadius: '4px',
    border: `1px solid ${COLORS.breadcrumb_light}`
  },
  '& table': {
    borderCollapse: 'collapse',
    backgroundColor: COLORS.surface,
    fontFamily: 'var(--font-family-mono)',
    fontSize: '0.875rem',
    width: '100%',
    minWidth: 'max-content'
  },
  '& th, & td': {
    border: `1px solid ${COLORS.breadcrumb_light}`,
    padding: '6px 12px',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  '& th': {
    backgroundColor: COLORS.breadcrumb_light,
    fontWeight: 600
  },
  // XML tag styling - display XML tags as colored text
  '& .xml-tag-opening': {
    marginBottom: '8px'
  },
  '& .xml-tag-closing': {
    marginTop: '8px',
    marginBottom: '32px'
  },
  // XML tag content indentation - simple indentation with no other styling
  '& .xml-tag-content': {
    paddingLeft: '1.5rem',
    '&[data-nesting-level="0"]': {
      paddingLeft: '1.5rem'
    },
    '&[data-nesting-level="1"]': {
      paddingLeft: '1.5rem'
    },
    '&[data-nesting-level="2"]': {
      paddingLeft: '1.5rem'
    },
    '&[data-nesting-level="3"]': {
      paddingLeft: '1.5rem'
    },
    '&[data-nesting-level="4"]': {
      paddingLeft: '1.5rem'
    },
    '&[data-nesting-level="5"]': {
      paddingLeft: '1.5rem'
    }
  }
}

const MarkdownViewer = ({ content, is_redacted }) => {
  const html_content = useMemo(() => {
    if (!content) return ''

    // Strip YAML frontmatter before rendering
    const content_without_frontmatter = content.replace(
      /^---\n[\s\S]*?\n---\n/,
      ''
    )

    return render_markdown(content_without_frontmatter)
  }, [content, is_redacted])

  return (
    <Box
      sx={{
        ...get_normal_styles
      }}
      title={
        is_redacted
          ? 'Access restricted - markdown content redacted'
          : undefined
      }
      aria-label={is_redacted ? 'Redacted markdown content' : undefined}
      role={is_redacted ? 'text' : undefined}
      dangerouslySetInnerHTML={{ __html: html_content }}
    />
  )
}

MarkdownViewer.propTypes = {
  content: PropTypes.string.isRequired,
  is_redacted: PropTypes.bool
}

export default MarkdownViewer
