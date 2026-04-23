import { expect } from 'chai'
import { build_renderer } from './_renderer-fixture.mjs'

describe('Markdown mermaid fence emission', () => {
  let md

  beforeEach(() => {
    md = build_renderer()
  })

  it('emits `<div class="mermaid-source" data-mermaid>` for ```mermaid fences', () => {
    const result = md.render('```mermaid\ngraph TD;\nA-->B;\n```')
    expect(result).to.include('class="mermaid-source"')
    expect(result).to.include('data-mermaid')
    expect(result).to.include('graph TD;')
  })

  it('still wraps non-mermaid fences with the copy-button container', () => {
    const result = md.render('```js\nconst x = 1;\n```')
    expect(result).to.include('code-block-wrapper')
    expect(result).to.include('data-copy-code')
    expect(result).to.not.include('data-mermaid')
  })

  it('HTML-escapes `<` and `>` in mermaid source (entityDecode round-trip)', () => {
    const result = md.render(
      '```mermaid\ngraph TD;\nA[<thing>] --> B;\n```'
    )
    expect(result).to.include('&lt;thing&gt;')
    expect(result).to.not.include('<thing>')
  })
})
