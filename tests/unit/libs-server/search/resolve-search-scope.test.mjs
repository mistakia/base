import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { resolve_search_scope } from '#libs-server/search/resolve-search-scope.mjs'

describe('resolve_search_scope', function () {
  this.timeout(5000)

  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scope-test-'))
  })

  afterEach(async () => {
    if (temp_dir) await fs.rm(temp_dir, { recursive: true, force: true })
  })

  it('returns null for an empty scope', () => {
    expect(
      resolve_search_scope({ scope_uri: null, user_base_directory: temp_dir })
    ).to.deep.equal({ resolved_path: null })
    expect(
      resolve_search_scope({ scope_uri: '', user_base_directory: temp_dir })
    ).to.deep.equal({ resolved_path: null })
  })

  it('resolves user: to the user base directory root', () => {
    const { resolved_path } = resolve_search_scope({
      scope_uri: 'user:',
      user_base_directory: temp_dir
    })
    expect(resolved_path).to.equal(path.resolve(temp_dir))
  })

  it('resolves user:<subpath> to an absolute subdirectory', () => {
    const { resolved_path } = resolve_search_scope({
      scope_uri: 'user:task/',
      user_base_directory: temp_dir
    })
    expect(resolved_path).to.equal(path.resolve(temp_dir, 'task'))
  })

  it('rejects raw filesystem paths', () => {
    expect(() =>
      resolve_search_scope({
        scope_uri: temp_dir,
        user_base_directory: temp_dir
      })
    ).to.throw(/base URI/)
  })

  it('rejects unknown schemes', () => {
    expect(() =>
      resolve_search_scope({
        scope_uri: 'bogus:thing',
        user_base_directory: temp_dir
      })
    ).to.throw()
  })

  it('rejects path traversal attempts', () => {
    expect(() =>
      resolve_search_scope({
        scope_uri: 'user:../etc',
        user_base_directory: temp_dir
      })
    ).to.throw(/traversal/)
  })
})
