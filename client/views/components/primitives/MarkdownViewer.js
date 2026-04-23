import React, { useMemo, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { render_markdown } from '@views/utils/markdown-renderer.js'
import { sanitize_html } from '@views/utils/sanitize-html.mjs'
import { run_mermaid_in } from '@views/utils/mermaid-runner.js'
import { history } from '@core/store.js'

import { COLORS } from '@theme/colors.js'
import '@styles/checkbox.styl'
import '@styles/plaintext-highlighting.styl'
import '@styles/markdown.styl'

const get_normal_styles = {
  // Heading anchor link (visible on hover, pointer devices only)
  '& h1[id], & h2[id], & h3[id], & h4[id], & h5[id], & h6[id]': {
    position: 'relative',
    '& .heading-anchor-link': {
      position: 'absolute',
      left: '-1.5em',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'transparent',
      textDecoration: 'none',
      border: 'none',
      borderBottom: 'none',
      cursor: 'pointer',
      transition: 'color 0.15s',
      userSelect: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      lineHeight: 1
    },
    '@media (pointer: fine)': {
      '&:hover .heading-anchor-link': {
        color: 'var(--color-text-disabled)'
      },
      '& .heading-anchor-link:hover': {
        color: 'var(--color-primary)'
      }
    }
  },
  '& h1': { fontSize: '1.25rem', fontWeight: 600, mb: 2, mt: 5 },
  '& h2': {
    fontSize: '1.125rem',
    fontWeight: 600,
    mb: 2,
    mt: 5
  },
  '& h3': { fontSize: '1rem', fontWeight: 600, mb: 1, mt: 3 },
  '& h4': {
    fontSize: '0.95rem',
    fontWeight: 600,
    mb: 1.5,
    mt: 3
  },
  '& h5': { fontSize: '0.9rem', fontWeight: 600, mb: 1, mt: 2 },
  '& h6': { fontSize: '0.85rem', fontWeight: 600, mb: 1, mt: 2 },
  '& p': { mb: 3, lineHeight: 1.55 },
  '& ul, & ol': { mb: 3, pl: 3 },
  '& ul ul': { m: 1, pl: 3 },
  '& ul': { listStyle: 'none' },
  '& ul li': { position: 'relative' },
  '& ul li::before': {
    content: '"- "',
    position: 'absolute',
    left: '-1.2em',
    color: 'var(--color-text-secondary)'
  },
  '& li': { mb: 0.5, lineHeight: 1.55 },
  '& pre': {
    backgroundColor: COLORS.code_bg,
    p: '0 16px',
    borderRadius: 2,
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
  '& .code-block-wrapper': {
    position: 'relative',
    '&:hover .code-copy-button, & .code-copy-button:focus-visible': {
      opacity: 1
    }
  },
  '& .code-copy-button': {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: '4px 6px',
    background: COLORS.surface,
    border: `1px solid ${COLORS.code_border}`,
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    opacity: 0,
    transition: 'opacity 0.15s, color 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    '&:hover': { color: 'var(--color-primary)' }
  },
  '& pre:has(code.language-prompt)': {
    backgroundColor: '#fff',
    border: '1px solid var(--color-border)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontSize: '0.9rem',
    lineHeight: 1.55,
    letterSpacing: '0.01em',
    '& code': {
      fontFamily: 'inherit',
      fontSize: 'inherit'
    },
    '& .prompt-file-ref': {
      fontFamily: 'var(--font-family-mono)',
      padding: '1px 5px',
      color: COLORS.icon_link
    },
    '& .prompt-slash-cmd': {
      color: COLORS.warning
    }
  },
  '& blockquote': {
    borderLeft: '2px solid var(--color-border)',
    padding: '9px 20px',
    margin: '1.25em 0',
    fontSize: '0.8rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'var(--color-text)',
    backgroundColor: COLORS.code_bg,
    border: `1px solid ${COLORS.code_border}`,
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
    fontWeight: 600,
    borderBottom: '1px dotted var(--color-primary)',
    cursor: 'pointer',
    transition: 'color 0.2s, border-bottom-color 0.2s',
    wordBreak: 'break-all'
  },
  '& a:hover': {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary-hover)'
  },
  '& hr': {
    border: 'none',
    borderTop: '1px solid var(--color-border-light)',
    margin: '2em 0'
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
    fontSize: '0.8125rem',
    width: '100%',
    minWidth: 'max-content'
  },
  '& th, & td': {
    border: `1px solid ${COLORS.breadcrumb_light}`,
    padding: '5px 10px',
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
  const container_ref = useRef(null)

  const html_content = useMemo(() => {
    if (!content) return ''

    // Strip YAML frontmatter before rendering
    const content_without_frontmatter = content.replace(
      /^---\n[\s\S]*?\n---\n/,
      ''
    )

    return sanitize_html(render_markdown(content_without_frontmatter))
  }, [content, is_redacted])

  // Scroll to a heading element by fragment ID
  const scroll_to_fragment = useCallback((fragment) => {
    if (!fragment) return
    const id = fragment.startsWith('#') ? fragment.slice(1) : fragment
    if (!id) return
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Intercept clicks on internal links to use client-side routing
  const handle_click = useCallback(
    (event) => {
      // Handle heading anchor link clicks -- copy section URL to clipboard
      const anchor_link = event.target.closest('a[data-heading-anchor]')
      if (anchor_link) {
        event.preventDefault()
        const href = anchor_link.getAttribute('href')
        if (!href) return
        const url = `${window.location.origin}${window.location.pathname}${href}`
        navigator.clipboard.writeText(url)
        scroll_to_fragment(href)
        window.history.replaceState(null, '', href)

        // Brief checkmark confirmation
        const original_html = anchor_link.innerHTML
        anchor_link.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>'
        anchor_link.style.color = 'var(--color-primary)'
        setTimeout(() => {
          anchor_link.innerHTML = original_html
          anchor_link.style.color = ''
        }, 1500)
        return
      }

      const copy_button = event.target.closest('button[data-copy-code]')
      if (copy_button) {
        event.preventDefault()
        const wrapper = copy_button.closest('.code-block-wrapper')
        const code_el = wrapper && wrapper.querySelector('pre code')
        if (!code_el) return

        const original_html = copy_button.innerHTML
        const original_aria_label = copy_button.getAttribute('aria-label')
        const restore = () => {
          copy_button.innerHTML = original_html
          copy_button.style.color = ''
          if (original_aria_label != null) {
            copy_button.setAttribute('aria-label', original_aria_label)
          }
        }
        const show_success = () => {
          copy_button.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>'
          copy_button.style.color = 'var(--color-primary)'
          copy_button.setAttribute('aria-label', 'Copied to clipboard')
          setTimeout(restore, 1500)
        }
        const show_failure = (error) => {
          if (error) console.error('Failed to copy code to clipboard:', error)
          copy_button.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>'
          copy_button.style.color = 'var(--color-error, #d33)'
          copy_button.setAttribute('aria-label', 'Failed to copy to clipboard')
          setTimeout(restore, 2000)
        }

        try {
          const write_promise =
            navigator.clipboard && navigator.clipboard.writeText
              ? navigator.clipboard.writeText(code_el.textContent)
              : Promise.reject(new Error('Clipboard API unavailable'))
          Promise.resolve(write_promise).then(show_success, show_failure)
        } catch (error) {
          show_failure(error)
        }
        return
      }

      const link = event.target.closest('a[data-internal-link]')
      if (!link) return

      // Allow modifier keys for open-in-new-tab behavior
      if (event.metaKey || event.ctrlKey || event.shiftKey) return

      const href = link.getAttribute('href')
      if (!href) return

      event.preventDefault()

      // Same-page hash link: scroll to target and update URL without pushing history
      if (href.startsWith('#')) {
        scroll_to_fragment(href)
        window.history.replaceState(null, '', href)
        return
      }

      history.push(href)
    },
    [scroll_to_fragment]
  )

  useEffect(() => {
    const container = container_ref.current
    if (!container) return

    container.addEventListener('click', handle_click)
    return () => container.removeEventListener('click', handle_click)
  }, [handle_click])

  // Scroll to fragment target after content renders (cross-page navigation)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !html_content) return

    requestAnimationFrame(() => {
      scroll_to_fragment(hash)
    })
  }, [html_content, scroll_to_fragment])

  // Run mermaid against any [data-mermaid] nodes after each HTML update.
  // requestAnimationFrame defers until after the browser paints so mermaid
  // reads non-zero container dimensions (otherwise it can produce 0x0 SVGs).
  useEffect(() => {
    const container = container_ref.current
    if (!container) return

    const raf = requestAnimationFrame(() => {
      run_mermaid_in(container)
    })
    return () => cancelAnimationFrame(raf)
  }, [html_content])

  return (
    <Box
      ref={container_ref}
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
