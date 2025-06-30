/**
 * Integration tests for Notion block-to-markdown conversion
 * Tests formatting issues and block transitions
 */

import { expect } from 'chai'
import { notion_blocks_to_markdown } from '../../../libs-server/integrations/notion/blocks/notion-blocks-to-markdown.mjs'

describe('Notion blocks to markdown conversion', () => {
  describe('Block transition spacing', () => {
    it('to-do list followed by heading should have proper spacing', () => {
      const blocks = [
        {
          id: 'todo-1',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Complete first task' }],
            checked: false
          }
        },
        {
          id: 'todo-2',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Complete second task' }],
            checked: true
          }
        },
        {
          id: 'heading-1',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ plain_text: 'Next Section' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // What we want (proper spacing with the fix)
      const expectedFixed = `- [ ] Complete first task
- [x] Complete second task

## Next Section`

      // Test the fixed behavior
      expect(result.trim()).to.equal(expectedFixed)
    })

    it('bulleted list followed by heading should have proper spacing', () => {
      const blocks = [
        {
          id: 'list-1',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ plain_text: 'First item' }]
          }
        },
        {
          id: 'list-2',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ plain_text: 'Second item' }]
          }
        },
        {
          id: 'heading-1',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ plain_text: 'Important Section' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // Fixed output with proper spacing
      const lines = result.split('\n')
      expect(lines).to.deep.equal([
        '- First item',
        '- Second item',
        '',
        '# Important Section'
      ])
    })

    it('toggle close followed by any block should have proper spacing', () => {
      const blocks = [
        {
          id: 'toggle-1',
          type: 'toggle',
          toggle: {
            rich_text: [{ plain_text: 'Expandable section' }]
          },
          children: [
            {
              id: 'toggle-content',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ plain_text: 'Content inside toggle' }]
              }
            }
          ]
        },
        {
          id: 'para-after',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'Regular paragraph after toggle' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // Should have proper spacing after toggle closes
      expect(result).to.contain(
        '</details>\n\n\nRegular paragraph after toggle'
      )
    })

    it('nested lists with varying depths should handle transitions properly', () => {
      const blocks = [
        {
          id: 'list-1',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ plain_text: 'Top level item' }]
          },
          children: [
            {
              id: 'nested-1',
              type: 'bulleted_list_item',
              bulleted_list_item: {
                rich_text: [{ plain_text: 'Nested item' }]
              }
            }
          ]
        },
        {
          id: 'para-after',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'Paragraph after nested list' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // Should handle proper indentation
      const lines = result.split('\n').filter((line) => line.trim())
      expect(lines).to.deep.equal([
        '- Top level item',
        '  - Nested item',
        'Paragraph after nested list'
      ])
    })

    it('empty paragraphs for intentional spacing should be preserved', () => {
      const blocks = [
        {
          id: 'para-1',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'First paragraph' }]
          }
        },
        {
          id: 'empty-para',
          type: 'paragraph',
          paragraph: {
            rich_text: []
          }
        },
        {
          id: 'para-2',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'Second paragraph after space' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // Should preserve intentional spacing from empty paragraph (3 newlines total)
      expect(result).to.contain(
        'First paragraph\n\n\nSecond paragraph after space'
      )
    })

    it('mixed block types in sequence should have consistent spacing', () => {
      const blocks = [
        {
          id: 'para-1',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'Introduction paragraph' }]
          }
        },
        {
          id: 'quote-1',
          type: 'quote',
          quote: {
            rich_text: [{ plain_text: 'Important quote' }]
          }
        },
        {
          id: 'code-1',
          type: 'code',
          code: {
            rich_text: [{ plain_text: 'console.log("hello");' }],
            language: 'javascript'
          }
        },
        {
          id: 'list-1',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Action item' }],
            checked: false
          }
        },
        {
          id: 'heading-1',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ plain_text: 'Summary' }]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // All blocks should have consistent spacing
      const sections = result.split('\n\n').filter((section) => section.trim())
      expect(sections.length).to.be.greaterThan(4) // Should have proper section breaks
    })
  })

  describe('Rich text formatting preservation', () => {
    it('should preserve bold, italic, and other formatting in block transitions', () => {
      const blocks = [
        {
          id: 'todo-formatted',
          type: 'to_do',
          to_do: {
            rich_text: [
              { plain_text: 'Complete ', annotations: {} },
              { plain_text: 'important', annotations: { bold: true } },
              { plain_text: ' task', annotations: {} }
            ],
            checked: false
          }
        },
        {
          id: 'heading-formatted',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              { plain_text: 'Next ', annotations: {} },
              { plain_text: 'Section', annotations: { italic: true } }
            ]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks, {
        preserve_formatting: true
      })

      expect(result).to.contain('- [ ] Complete **important** task')
      expect(result).to.contain('## Next *Section*')
    })
  })

  describe('Real-world scenarios', () => {
    it('task list followed by status update (common pattern)', () => {
      const blocks = [
        {
          id: 'task-1',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Review code changes' }],
            checked: true
          }
        },
        {
          id: 'task-2',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Update documentation' }],
            checked: false
          }
        },
        {
          id: 'task-3',
          type: 'to_do',
          to_do: {
            rich_text: [{ plain_text: 'Deploy to staging' }],
            checked: false
          }
        },
        {
          id: 'status-heading',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ plain_text: 'Status Update' }]
          }
        },
        {
          id: 'status-para',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { plain_text: 'Code review completed. Ready for next phase.' }
            ]
          }
        }
      ]

      const result = notion_blocks_to_markdown(blocks)

      // This should be properly formatted with appropriate spacing
      const lines = result.split('\n')

      // Find the transition from tasks to heading
      const taskLines = lines.filter((line) => line.startsWith('- ['))
      const headingIndex = lines.findIndex((line) =>
        line.startsWith('### Status Update')
      )

      expect(taskLines).to.have.length(3)
      expect(headingIndex).to.be.greaterThan(-1)

      // Check spacing before heading
      if (headingIndex > 0) {
        const lineBeforeHeading = lines[headingIndex - 1]
        // Should have proper spacing (empty line) before heading
        expect(lineBeforeHeading).to.equal('')
      }
    })
  })
})
