import React from 'react'
import PropTypes from 'prop-types'
import CodeViewer from '@components/code-viewer'

import './block-renderer.styl'

const BlockRenderer = ({ blocks_data, className = '' }) => {
  if (!blocks_data?.blocks || !blocks_data?.document) return null

  const { document, blocks } = blocks_data

  const render_block = (block) => {
    const key = block.block_cid
    const base_class = `block-item block-${block.type}`
    const redacted_class = block.is_redacted ? ' block-redacted' : ''
    const block_classes = `${base_class}${redacted_class}`

    // If block is redacted, show redacted placeholder
    if (block.is_redacted) {
      return (
        <div key={key} className={block_classes}>
          <div className='redacted-content'>
            <span className='redacted-label'>[REDACTED]</span>
            <span className='redacted-type'>({block.type})</span>
            {block.redaction_reason && (
              <span className='redaction-reason'>{block.redaction_reason}</span>
            )}
          </div>
        </div>
      )
    }

    // Render regular block content based on type
    switch (block.type) {
      case 'heading': {
        const heading_level = block.attributes?.level || 1
        const HeadingTag = `h${Math.min(heading_level, 6)}`
        return (
          <div key={key} className={block_classes}>
            <HeadingTag>{block.content}</HeadingTag>
          </div>
        )
      }

      case 'paragraph':
        return (
          <div key={key} className={block_classes}>
            <p>{block.content}</p>
          </div>
        )

      case 'code': {
        const language = block.attributes?.language || 'text'
        return (
          <div key={key} className={block_classes}>
            <CodeViewer code={block.content} language={language} />
          </div>
        )
      }

      case 'blockquote':
        return (
          <div key={key} className={block_classes}>
            <blockquote>{block.content}</blockquote>
          </div>
        )

      case 'list': {
        const is_ordered = block.attributes?.ordered || false
        const ListTag = is_ordered ? 'ol' : 'ul'

        // Get list items that are children of this list
        const list_items =
          block.relationships?.children
            ?.map((child_cid) => blocks[child_cid])
            ?.filter((child) => child && child.type === 'list_item') || []

        return (
          <div key={key} className={block_classes}>
            <ListTag>
              {list_items.map((item) => render_list_item({ item }))}
            </ListTag>
          </div>
        )
      }

      case 'list_item':
        // This will be handled by the parent list, so skip individual rendering
        return null

      case 'image': {
        const image_url = block.attributes?.uri || ''
        const alt_text = block.attributes?.alt_text || ''
        const caption = block.attributes?.caption

        return (
          <div key={key} className={block_classes}>
            <img src={image_url} alt={alt_text} />
            {caption && <div className='image-caption'>{caption}</div>}
          </div>
        )
      }

      case 'thematic_break':
        return (
          <div key={key} className={block_classes}>
            <hr />
          </div>
        )

      case 'table': {
        // Get table rows that are children of this table
        const table_rows =
          block.relationships?.children
            ?.map((child_cid) => blocks[child_cid])
            ?.filter((child) => child && child.type === 'table_row') || []

        return (
          <div key={key} className={block_classes}>
            <table>
              <tbody>
                {table_rows.map((row) => render_table_row({ row }))}
              </tbody>
            </table>
          </div>
        )
      }

      case 'table_row':
        // This will be handled by the parent table, so skip individual rendering
        return null

      default:
        return (
          <div key={key} className={block_classes}>
            <div className='unknown-block'>
              <strong>[{block.type.toUpperCase()}]</strong>
              <span>{block.content}</span>
            </div>
          </div>
        )
    }
  }

  const render_list_item = ({ item }) => {
    const key = item.block_cid
    const checked = item.attributes?.checked
    const is_task = checked !== undefined

    if (item.is_redacted) {
      return (
        <li key={key} className='list-item-redacted'>
          <div className='redacted-content'>
            <span className='redacted-label'>[REDACTED LIST ITEM]</span>
          </div>
        </li>
      )
    }

    if (is_task) {
      return (
        <li key={key} className='task-item'>
          <input type='checkbox' checked={checked} disabled />
          <span>{item.content}</span>
        </li>
      )
    }

    return <li key={key}>{item.content}</li>
  }

  const render_table_row = ({ row }) => {
    const key = row.block_cid
    const cells = row.attributes?.cells || []

    if (row.is_redacted) {
      return (
        <tr key={key} className='table-row-redacted'>
          <td colSpan={cells.length || 1}>
            <div className='redacted-content'>
              <span className='redacted-label'>[REDACTED TABLE ROW]</span>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr key={key}>
        {cells.map((cell, index) => (
          <td key={index}>{cell}</td>
        ))}
      </tr>
    )
  }

  // Get top-level blocks (children of the document)
  const top_level_blocks =
    document.relationships?.children
      ?.map((child_cid) => blocks[child_cid])
      ?.filter((block) => block) || []

  return (
    <div className={`block-renderer ${className}`}>
      {top_level_blocks.map((block) => render_block(block))}
    </div>
  )
}

BlockRenderer.propTypes = {
  blocks_data: PropTypes.shape({
    document: PropTypes.object.isRequired,
    blocks: PropTypes.object.isRequired
  }),
  className: PropTypes.string
}

export default BlockRenderer
