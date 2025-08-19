import React, { useMemo, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { render_markdown } from '@views/utils/markdown-renderer.js'
import { handle_link_click } from '@views/utils/link-processor.js'

const get_normal_styles = {
  '& h1': { fontSize: '1.25rem', fontWeight: 600, mb: 1.5, mt: 2 },
  '& h2': {
    fontSize: '1.125rem',
    fontWeight: 600,
    mb: 1.2,
    mt: 1.7
  },
  '& h3': { fontSize: '1rem', fontWeight: 600, mb: 1, mt: 1.5 },
  '& h4': {
    fontSize: '0.95rem',
    fontWeight: 600,
    mb: 0.8,
    mt: 1.2
  },
  '& h5': { fontSize: '0.9rem', fontWeight: 600, mb: 0.7, mt: 1 },
  '& h6': { fontSize: '0.85rem', fontWeight: 600, mb: 0.7, mt: 1 },
  '& p': { mb: 1, lineHeight: 1.3 },
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
    fontFamily: 'var(--font-family-mono)'
  },
  '& pre code': {
    backgroundColor: 'transparent',
    padding: 0
  },
  '& blockquote': {
    borderLeft: '3px solid var(--color-text-disabled)',
    paddingLeft: '12px',
    margin: '0.75em 0',
    fontStyle: 'italic',
    opacity: 0.9
  },
  '& a': {
    color: 'inherit',
    textDecoration: 'underline',
    textDecorationColor: 'red',
    textDecorationStyle: 'dotted',
    cursor: 'pointer',
    transition: 'color 0.2s'
  },
  '& a:hover': {
    color: 'red'
  },
  '& hr': {
    border: 'none',
    borderTop: '1px solid var(--color-text-disabled)',
    margin: '1em 0',
    opacity: 0.7
  },
  '& table': {
    borderCollapse: 'collapse',
    width: '100%',
    margin: '0.75em 0'
  },
  '& th, & td': {
    border: '1px solid var(--color-text-disabled)',
    padding: '6px 12px',
    textAlign: 'left'
  },
  '& th': {
    backgroundColor:
      'color-mix(in srgb, var(--color-text-disabled) 15%, transparent)',
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

    // For redacted content, render the markdown structure with redacted styling
    if (is_redacted) {
      // The content is already redacted markdown from the server
      // Render it as markdown to preserve structure, then apply redacted styling
      return render_markdown(content_without_frontmatter)
    }

    return render_markdown(content_without_frontmatter)
  }, [content, is_redacted])

  const on_click = useCallback((event) => {
    handle_link_click(event)
  }, [])

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
      onClick={on_click}
      dangerouslySetInnerHTML={{ __html: html_content }}
    />
  )
}

MarkdownViewer.propTypes = {
  content: PropTypes.string.isRequired,
  is_redacted: PropTypes.bool
}

export default MarkdownViewer
