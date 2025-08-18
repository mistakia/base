import { expect } from 'chai'
import MarkdownIt from 'markdown-it'

// Import the XML styling plugin directly
const md_plugin_path = '../../../client/views/utils/markdown-it-xml-styling.mjs'

describe('XML Tag Styling Plugin', () => {
  let md

  beforeEach(async () => {
    // Dynamically import the plugin to handle ES module
    const { default: markdownItXmlStyling } = await import(md_plugin_path)

    // Initialize markdown-it with our plugin
    md = new MarkdownIt({
      html: true, // Enable HTML to see styled XML tags
      breaks: true
    }).use(markdownItXmlStyling, {
      colors: [
        'red',
        'green',
        'yellow',
        'blue',
        'light-gray',
        'dark-gray',
        'purple'
      ],
      maxIndentLevel: 10
    })
  })

  describe('Basic XML tag processing', () => {
    it('should wrap simple XML tag content with styling div', () => {
      const markdown = `
<task>
This is content inside a task tag.
</task>
`
      const result = md.render(markdown)

      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;task&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #ff3f3f.*>&lt;\/task&gt;<\/div>/
      )
      expect(result).to.include(
        '<div class="xml-tag-content" data-nesting-level="0" style="border-left: 1px solid #ff3f3f;"'
      )
      expect(result).to.include('</div>')
      expect(result).to.include('This is content inside a task tag.')
    })

    it('should handle nested XML tags with unique colors per tag pair', () => {
      const markdown = `
<outer>
Content in outer tag
<inner>
Content in inner tag
</inner>
More content in outer
</outer>
`
      const result = md.render(markdown)

      // Each unique tag should get its own color
      // Root level should have border, nested level should not
      expect(result).to.include(
        'data-nesting-level="0" style="border-left: 1px solid #ff3f3f;"'
      ) // outer tag with border
      expect(result).to.include('data-nesting-level="1">') // inner tag without border
      // "outer" tag should get first color (red), "inner" tag should get second color (green)
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;outer&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;inner&gt;<\/div>/
      )
    })

    it('should handle deeply nested XML tags with unique colors per tag', () => {
      const markdown = `
<level1>
<level2>
<level3>
<level4>
<level5>
<level6>
<level7>
<level8>
Deep nesting content
</level8>
</level7>
</level6>
</level5>
</level4>
</level3>
</level2>
</level1>
`
      const result = md.render(markdown)

      // Each unique tag should get its own color from available palette
      // First 7 tags use predefined colors, then random selection
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;level1&gt;<\/div>/
      ) // red
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;level2&gt;<\/div>/
      ) // green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ffbb3f.*>&lt;level3&gt;<\/div>/
      ) // yellow
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f3fff.*>&lt;level4&gt;<\/div>/
      ) // blue
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #9f9f9f.*>&lt;level5&gt;<\/div>/
      ) // light-gray
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f3f3f.*>&lt;level6&gt;<\/div>/
      ) // dark-gray
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #800080.*>&lt;level7&gt;<\/div>/
      ) // purple

      // After exhausting predefined colors, should use random selection
      expect(result).to.include('data-nesting-level="5"')
      expect(result).to.include('data-nesting-level="6"')
      expect(result).to.include('data-nesting-level="7"')
    })

    it('should handle self-closing XML tags without wrapper divs', () => {
      const markdown = `
Some content
<custom-br/>
More content
<custom-img src="test.jpg"/>
Final content
`
      const result = md.render(markdown)
      // Self-closing tags should be styled but not wrapped
      // Each unique tag gets its own color: custom-br gets red, custom-img gets green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;custom-br\/&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;custom-img src=&quot;test.jpg&quot;\/&gt;<\/div>/
      )
      // Should not wrap self-closing tags
      expect(result).to.not.include('<div class="xml-tag-content"')
    })

    it('should preserve markdown formatting within XML tags', () => {
      const markdown = `
<task>
# This is a heading

This is **bold text** and *italic text*.

- List item 1
- List item 2
</task>
`
      const result = md.render(markdown)

      // Should contain XML tag structure with styling
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;task&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #ff3f3f.*>&lt;\/task&gt;<\/div>/
      )
      expect(result).to.include('<div class="xml-tag-content"')

      // Should preserve some markdown formatting (not all due to post-processing approach)
      // Headers may not be processed due to XML tag interference
      expect(result).to.include('<strong>')
      expect(result).to.include('<em>')
      expect(result).to.include('<li>')
    })

    it('should handle multiple separate XML tag blocks', () => {
      const markdown = `
<first>
Content in first block
</first>

Some regular markdown content.

<second>
Content in second block
</second>
`
      const result = md.render(markdown)

      // Each unique tag should get its own color
      // "first" tag gets red, "second" tag gets green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;first&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;second&gt;<\/div>/
      )

      // Both should be at nesting level 0
      const nestingLevel0Matches = result.match(/data-nesting-level="0"/g)
      expect(nestingLevel0Matches).to.have.length(2)
    })

    it('should handle malformed XML gracefully', () => {
      const markdown = `
<task>
Content with unclosed tag

<other>
Some content
</other>
`
      const result = md.render(markdown)

      // Should still process the properly closed tag
      // "task" gets red (first), "other" gets green (second)
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;other&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #3f9f3f.*>&lt;\/other&gt;<\/div>/
      )
      expect(result).to.include('<div class="xml-tag-content"')
    })

    it('should handle XML tags with attributes', () => {
      const markdown = `
<task id="123" priority="high">
Task content with attributes
</task>
`
      const result = md.render(markdown)

      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;task id=&quot;123&quot; priority=&quot;high&quot;&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #ff3f3f.*>&lt;\/task&gt;<\/div>/
      )
      expect(result).to.include(
        '<div class="xml-tag-content" data-nesting-level="0"'
      )
      expect(result).to.include('Task content with attributes')
    })

    it('should handle mixed XML tags and other markdown elements', () => {
      const markdown = `
# Main Heading

Regular paragraph.

<context>
This is contextual information.

## Subheading in context

- Context item 1
- Context item 2
</context>

Another regular paragraph.

<instructions>
1. Do this
2. Do that
</instructions>
`
      const result = md.render(markdown)

      // Should have main heading outside XML
      expect(result).to.include('<h1>')

      // Should have XML tag structure with styling
      // "context" gets red, "instructions" gets green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;context&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;instructions&gt;<\/div>/
      )
      expect(result).to.include('data-nesting-level="0"')

      // Should preserve some markdown within XML (limited due to post-processing approach)
      // Complex markdown like headers and ordered lists may not be processed
      expect(result).to.include('<li>') // Basic list items should work
    })

    it('should handle edge case with empty XML tags', () => {
      const markdown = `
<empty></empty>

<whitespace>   </whitespace>
`
      const result = md.render(markdown)

      // "empty" gets red, "whitespace" gets green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;empty&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #ff3f3f.*>&lt;\/empty&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;whitespace&gt;<\/div>/
      )
      expect(result).to.match(
        /<div class="xml-tag-closing" style="color: #3f9f3f.*>&lt;\/whitespace&gt;<\/div>/
      )
      expect(result).to.include('<div class="xml-tag-content"')
    })
  })

  describe('Color assignment consistency', () => {
    it('should assign consistent colors to the same tag names across different renders', () => {
      const markdown1 = `
<outer>
<inner>Content</inner>
</outer>
`
      const markdown2 = `
<different>
<inner>Content</inner> 
</different>
`

      const result1 = md.render(markdown1)
      const result2 = md.render(markdown2)

      // "inner" tag should get the same color in both renders (green, since it's the second unique tag encountered)
      expect(result1).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;inner&gt;<\/div>/
      )
      expect(result2).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;inner&gt;<\/div>/
      )
    })

    it('should assign different colors to different tag names', () => {
      const markdown = `
<tag1>Content</tag1>
<tag2>Content</tag2>
<tag3>Content</tag3>
`
      const result = md.render(markdown)

      // Each tag should get a different color
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ff3f3f.*>&lt;tag1&gt;<\/div>/
      ) // red
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #3f9f3f.*>&lt;tag2&gt;<\/div>/
      ) // green
      expect(result).to.match(
        /<div class="xml-tag-opening" style="color: #ffbb3f.*>&lt;tag3&gt;<\/div>/
      ) // yellow
    })
  })

  describe('Border styling', () => {
    it('should add left border to root level XML tag content', () => {
      const markdown = `
<task>
Root level content
</task>

<context>
Another root level content
</context>
`
      const result = md.render(markdown)

      // Root level tags should have borders matching their colors
      expect(result).to.include(
        'data-nesting-level="0" style="border-left: 1px solid #ff3f3f;"'
      ) // task (red)
      expect(result).to.include(
        'data-nesting-level="0" style="border-left: 1px solid #3f9f3f;"'
      ) // context (green)
    })

    it('should not add borders to nested XML tag content', () => {
      const markdown = `
<outer>
Root content
<inner>
Nested content should not have border
<deeply-nested>
This should also not have border
</deeply-nested>
</inner>
</outer>
`
      const result = md.render(markdown)

      // Only root level should have border
      expect(result).to.include(
        'data-nesting-level="0" style="border-left: 1px solid #ff3f3f;"'
      ) // outer (red)
      expect(result).to.include('data-nesting-level="1">') // inner (no border)
      expect(result).to.include('data-nesting-level="2">') // deeply-nested (no border)

      // Should not have multiple border styles
      expect(result.split('border-left:').length - 1).to.equal(1) // Only one border
    })
  })
})
