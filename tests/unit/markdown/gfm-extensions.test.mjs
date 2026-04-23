import { expect } from 'chai'
import { build_renderer } from './_renderer-fixture.mjs'

describe('Markdown GFM extensions', () => {
  let md

  beforeEach(() => {
    md = build_renderer()
  })

  it('renders footnotes', () => {
    const result = md.render('Text with footnote[^1]\n\n[^1]: The note.')
    expect(result).to.include('footnote-ref')
    expect(result).to.include('The note.')
  })

  it('renders definition lists', () => {
    const result = md.render('Term\n: Definition body')
    expect(result).to.include('<dl>')
    expect(result).to.include('<dt>Term</dt>')
    expect(result).to.include('<dd>Definition body</dd>')
  })

  it('renders subscript', () => {
    const result = md.render('H~2~O')
    expect(result).to.include('<sub>2</sub>')
  })

  it('renders superscript', () => {
    const result = md.render('19^th^ century')
    expect(result).to.include('<sup>th</sup>')
  })

  it('renders emoji shortcodes', () => {
    const result = md.render(':tada: shipped')
    expect(result).to.include('🎉')
  })

  it('renders GitHub-style alerts', () => {
    const result = md.render('> [!NOTE]\n> Heads up.')
    expect(result).to.include('markdown-alert')
    expect(result).to.include('markdown-alert-note')
  })
})
