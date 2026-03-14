import { expect } from 'chai'
import { validate_relative_path_links } from '#libs-server/entity/validation/validate-relative-path-links.mjs'

describe('validate_relative_path_links', () => {
  it('should return no warnings for content without relative links', () => {
    const result = validate_relative_path_links({
      entity_content:
        'See [[user:text/homelab/backup.md]] for details.\n\n![Chart](user:text/chart.png)'
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should warn on markdown links with ../', () => {
    const result = validate_relative_path_links({
      entity_content: 'See the [Landscape](../homelab/landscape.md) for more.'
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.include('../homelab/landscape.md')
    expect(result.warnings[0]).to.include('base-uri')
  })

  it('should warn on image links with ../', () => {
    const result = validate_relative_path_links({
      entity_content:
        '![Chart](../../text/land-cruiser/chart.png)'
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.include('../../text/land-cruiser/chart.png')
  })

  it('should warn on links with ./', () => {
    const result = validate_relative_path_links({
      entity_content: 'See [sibling](./sibling-doc.md) for details.'
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.include('./sibling-doc.md')
  })

  it('should detect multiple relative links', () => {
    const result = validate_relative_path_links({
      entity_content:
        '[A](../a.md) and [B](../../b.md) and ![C](./c.png)'
    })
    expect(result.warnings).to.have.lengthOf(3)
  })

  it('should skip relative links inside fenced code blocks', () => {
    const result = validate_relative_path_links({
      entity_content:
        'Normal text.\n\n```markdown\n[Example](../example.md)\n```\n\nMore text.'
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should return no warnings for empty content', () => {
    const result = validate_relative_path_links({ entity_content: '' })
    expect(result.warnings).to.deep.equal([])
  })

  it('should return no warnings for undefined content', () => {
    const result = validate_relative_path_links({})
    expect(result.warnings).to.deep.equal([])
  })

  it('should not flag non-link text containing ../', () => {
    const result = validate_relative_path_links({
      entity_content:
        'Navigate to ../parent directory. The path is ../../somewhere.'
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should not flag external URLs', () => {
    const result = validate_relative_path_links({
      entity_content:
        '[Google](https://google.com) and [Docs](http://docs.example.com)'
    })
    expect(result.warnings).to.deep.equal([])
  })
})
