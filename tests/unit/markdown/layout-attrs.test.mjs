import { expect } from 'chai'
import { build_renderer } from './_renderer-fixture.mjs'

describe('Markdown layout primitives and attribute whitelist', () => {
  let md

  beforeEach(() => {
    md = build_renderer()
  })

  it('attaches `{.columns}` to a paragraph as `<p class="columns">`', () => {
    const result = md.render('Hello world\n{.columns}')
    expect(result).to.include('<p class="columns">')
  })

  it('drops `onclick` and `style` attributes (not in whitelist)', () => {
    const result = md.render('Click me\n{onclick=alert(1) style=color:red}')
    expect(result).to.not.include('onclick')
    expect(result).to.not.include('color:red')
  })

  it('renders `:::columns` container as `<div class="columns">`', () => {
    const result = md.render('::: columns\nbody text\n:::')
    expect(result).to.include('<div class="columns">')
  })

  it('composes container, attrs, and KaTeX without breaking ordering', () => {
    const result = md.render('A paragraph with $x^2$ math.\n{.columns}')
    expect(result).to.include('<p class="columns">')
    expect(result).to.include('class="katex"')
  })
})
