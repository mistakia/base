import { expect } from 'chai'
import { build_renderer } from './_renderer-fixture.mjs'

describe('Markdown KaTeX rendering', () => {
  let md

  beforeEach(() => {
    md = build_renderer()
  })

  it('renders inline math `$x^2$` as a KaTeX span', () => {
    const result = md.render('$x^2$')
    expect(result).to.include('class="katex"')
  })

  it('renders display math `$$\\frac{a}{b}$$` as a KaTeX display block', () => {
    const result = md.render('$$\\frac{a}{b}$$')
    expect(result).to.include('class="katex')
    expect(result).to.include('katex-display')
  })

  it('does not render `$200 fee` as math (Pandoc delimiter rules)', () => {
    const result = md.render('I owe a $200 fee for the late filing.')
    expect(result).to.not.include('class="katex"')
    expect(result).to.include('$200 fee')
  })

  it("renders the constitution's DOI formula without throwing", () => {
    const formula =
      '$$\\mathrm{DOI} = 0.9 \\cdot \\widehat{PP} + 0.1 \\cdot \\widehat{APL}$$'
    const result = md.render(formula)
    expect(result).to.include('katex-display')
    expect(result).to.include('DOI')
  })
})
