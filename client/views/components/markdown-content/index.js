import React, { useRef, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import render_markdown from '@views/utils/markdown-renderer'
import MuiCheckboxReplacer from './mui-checkbox-replacer'

import './markdown-content.styl'

const MarkdownContent = ({ content, className = '' }) => {
  if (!content) return null

  const html_content = render_markdown(content)
  const content_ref = useRef(null)
  const [element, set_element] = useState(null)

  useEffect(() => {
    if (content_ref.current) {
      set_element(content_ref.current)
    }
  }, [])

  return (
    <>
      <div
        ref={content_ref}
        className={`markdown-content ${className}`}
        dangerouslySetInnerHTML={{ __html: html_content }}
      />
      {element && <MuiCheckboxReplacer element={element} />}
    </>
  )
}

MarkdownContent.propTypes = {
  content: PropTypes.string,
  className: PropTypes.string
}

export default MarkdownContent
