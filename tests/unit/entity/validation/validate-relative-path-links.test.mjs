import { expect } from 'chai'
import { validate_relative_path_links } from '#libs-server/entity/validation/validate-relative-path-links.mjs'

describe('validate_relative_path_links', () => {
  it('should return no errors for content without relative links', () => {
    const result = validate_relative_path_links({
      entity_content:
        'See [[user:text/homelab/backup.md]] for details.\n\n![Chart](user:text/chart.png)'
    })
    expect(result.errors).to.deep.equal([])
  })

  it('should error on markdown links with ../', () => {
    const result = validate_relative_path_links({
      entity_content: 'See the [Landscape](../homelab/landscape.md) for more.'
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('../homelab/landscape.md')
    expect(result.errors[0]).to.include('base-uri')
  })

  it('should error on image links with ../', () => {
    const result = validate_relative_path_links({
      entity_content: '![Chart](../../text/land-cruiser/chart.png)'
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('../../text/land-cruiser/chart.png')
  })

  it('should error on links with ./', () => {
    const result = validate_relative_path_links({
      entity_content: 'See [sibling](./sibling-doc.md) for details.'
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('./sibling-doc.md')
  })

  it('should detect multiple relative links', () => {
    const result = validate_relative_path_links({
      entity_content: '[A](../a.md) and [B](../../b.md) and ![C](./c.png)'
    })
    expect(result.errors).to.have.lengthOf(3)
  })

  it('should still flag relative links inside fenced code blocks', () => {
    const result = validate_relative_path_links({
      entity_content:
        'Normal text.\n\n```markdown\n[Example](../example.md)\n```\n\nMore text.'
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('../example.md')
  })

  it('should still flag relative links inside inline code spans', () => {
    const result = validate_relative_path_links({
      entity_content: 'Use `![alt](./sibling.png)` to colocate assets.'
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('./sibling.png')
  })

  it('should suppress an error matched by a validation_exceptions entry', () => {
    const result = validate_relative_path_links({
      entity_content: 'Use `![alt](./sibling.png)` to colocate assets.',
      validation_exceptions: [
        {
          rule: 'relative-path-link',
          match: '![alt](./sibling.png)',
          reason: 'Documents the colocated-asset reference form.'
        }
      ]
    })
    expect(result.errors).to.deep.equal([])
    expect(result.unused_exceptions).to.deep.equal([])
  })

  it('should report exceptions that do not match anything as unused', () => {
    const result = validate_relative_path_links({
      entity_content: 'Plain prose with no relative links.',
      validation_exceptions: [
        {
          rule: 'relative-path-link',
          match: '![alt](./missing.png)',
          reason: 'No longer applicable.'
        }
      ]
    })
    expect(result.errors).to.deep.equal([])
    expect(result.unused_exceptions).to.have.lengthOf(1)
    expect(result.unused_exceptions[0].match).to.equal(
      '![alt](./missing.png)'
    )
  })

  it('should ignore exceptions for unrelated rules', () => {
    const result = validate_relative_path_links({
      entity_content: '[A](../a.md)',
      validation_exceptions: [
        { rule: 'some-other-rule', match: '[A](../a.md)' }
      ]
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.unused_exceptions).to.deep.equal([])
  })

  it('should suppress only matching links and still flag others', () => {
    const result = validate_relative_path_links({
      entity_content: '[A](../a.md) and [B](../b.md)',
      validation_exceptions: [
        { rule: 'relative-path-link', match: '[A](../a.md)' }
      ]
    })
    expect(result.errors).to.have.lengthOf(1)
    expect(result.errors[0]).to.include('../b.md')
    expect(result.unused_exceptions).to.deep.equal([])
  })

  it('should return no errors for empty content', () => {
    const result = validate_relative_path_links({ entity_content: '' })
    expect(result.errors).to.deep.equal([])
  })

  it('should return no errors for undefined content', () => {
    const result = validate_relative_path_links({})
    expect(result.errors).to.deep.equal([])
  })

  it('should not flag non-link text containing ../', () => {
    const result = validate_relative_path_links({
      entity_content:
        'Navigate to ../parent directory. The path is ../../somewhere.'
    })
    expect(result.errors).to.deep.equal([])
  })

  it('should not flag external URLs', () => {
    const result = validate_relative_path_links({
      entity_content:
        '[Google](https://google.com) and [Docs](http://docs.example.com)'
    })
    expect(result.errors).to.deep.equal([])
  })
})
