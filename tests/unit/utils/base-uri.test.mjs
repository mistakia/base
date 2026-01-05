import { expect } from 'chai'

import {
  create_system_uri,
  create_user_uri,
  create_ssh_uri,
  create_git_uri,
  parse_base_uri,
  is_valid_base_uri,
  resolve_base_uri,
  create_base_uri_from_path
} from '#libs-server/base-uri/index.mjs'

describe('Base URI Utilities', () => {
  describe('create_system_uri', () => {
    it('should create system URI with clean path', () => {
      expect(create_system_uri('schema/task.md')).to.equal('sys:schema/task.md')
      expect(create_system_uri('/schema/task.md')).to.equal(
        'sys:schema/task.md'
      )
      expect(create_system_uri('schema/task.md/')).to.equal(
        'sys:schema/task.md'
      )
    })
  })

  describe('create_user_uri', () => {
    it('should create user URI with clean path', () => {
      expect(create_user_uri('task/my-task.md')).to.equal(
        'user:task/my-task.md'
      )
      expect(create_user_uri('/task/my-task.md')).to.equal(
        'user:task/my-task.md'
      )
      expect(create_user_uri('task/my-task.md/')).to.equal(
        'user:task/my-task.md'
      )
    })
  })

  describe('create_ssh_uri', () => {
    it('should create SSH URI with clean path', () => {
      expect(
        create_ssh_uri({ host_name: 'database', remote_path: '/etc/config.md' })
      ).to.equal('ssh://database/etc/config.md')
      expect(
        create_ssh_uri({ host_name: 'league', remote_path: 'var/www/api.md' })
      ).to.equal('ssh://league/var/www/api.md')
    })
  })

  describe('create_git_uri', () => {
    it('should create git URI without branch', () => {
      const result = create_git_uri({
        repo_url: 'github.com/owner/repo',
        file_path: 'docs/api.md'
      })
      expect(result).to.equal('git://github.com/owner/repo/docs/api.md')
    })

    it('should create git URI with branch', () => {
      const result = create_git_uri({
        repo_url: 'github.com/owner/repo',
        file_path: 'docs/api.md',
        branch: 'main'
      })
      expect(result).to.equal('git://github.com/owner/repo/docs/api.md@main')
    })
  })

  describe('parse_base_uri', () => {
    it('should parse system URI', () => {
      const result = parse_base_uri('sys:schema/task.md')
      expect(result).to.deep.equal({
        scheme: 'sys',
        authority: '',
        path: 'schema/task.md',
        branch: null,
        fragment: null,
        original: 'sys:schema/task.md'
      })
    })

    it('should parse SSH URI with authority', () => {
      const result = parse_base_uri('ssh://database/etc/config.md')
      expect(result).to.deep.equal({
        scheme: 'ssh',
        authority: 'database',
        path: 'etc/config.md',
        branch: null,
        fragment: null,
        original: 'ssh://database/etc/config.md'
      })
    })

    it('should parse git URI with branch', () => {
      const result = parse_base_uri(
        'git://github.com/owner/repo/docs/api.md@main'
      )
      expect(result).to.deep.equal({
        scheme: 'git',
        authority: 'github.com',
        path: 'owner/repo/docs/api.md',
        branch: 'main',
        fragment: null,
        original: 'git://github.com/owner/repo/docs/api.md@main'
      })
    })

    it('should parse URI with fragment identifier', () => {
      const result = parse_base_uri(
        'user:repository/active/league/docs/glossary.md#play-by-play-columns'
      )
      expect(result).to.deep.equal({
        scheme: 'user',
        authority: '',
        path: 'repository/active/league/docs/glossary.md',
        branch: null,
        fragment: 'play-by-play-columns',
        original:
          'user:repository/active/league/docs/glossary.md#play-by-play-columns'
      })
    })

    it('should parse URI with both branch and fragment', () => {
      const result = parse_base_uri(
        'git://github.com/owner/repo/docs/api.md@main#section'
      )
      expect(result).to.deep.equal({
        scheme: 'git',
        authority: 'github.com',
        path: 'owner/repo/docs/api.md',
        branch: 'main',
        fragment: 'section',
        original: 'git://github.com/owner/repo/docs/api.md@main#section'
      })
    })

    it('should throw error for invalid URI', () => {
      expect(() => parse_base_uri('invalid-uri')).to.throw(
        /Invalid base_uri format/
      )
      expect(() => parse_base_uri('')).to.throw(/Invalid base_uri/)
      expect(() => parse_base_uri(null)).to.throw(/Invalid base_uri/)
    })
  })

  describe('is_valid_base_uri', () => {
    it('should validate correct URIs', () => {
      expect(is_valid_base_uri('sys:schema/task.md')).to.be.true
      expect(is_valid_base_uri('user:task/my-task.md')).to.be.true
      expect(is_valid_base_uri('ssh://database/config.md')).to.be.true
      expect(is_valid_base_uri('git://github.com/owner/repo/file.md')).to.be
        .true
      expect(is_valid_base_uri('https://example.com/api.md')).to.be.true
    })

    it('should reject invalid URIs', () => {
      expect(is_valid_base_uri('invalid-uri')).to.be.false
      expect(is_valid_base_uri('unknown://path')).to.be.false
      expect(is_valid_base_uri('')).to.be.false
      expect(is_valid_base_uri(null)).to.be.false
    })
  })

  describe('resolve_base_uri', () => {
    const mockOptions = {
      system_base_directory: '/mock/system',
      user_base_directory: '/mock/user'
    }

    it('should resolve system URI', () => {
      const result = resolve_base_uri('sys:schema/task.md', mockOptions)
      expect(result).to.equal('/mock/system/schema/task.md')
    })

    it('should resolve user URI', () => {
      const result = resolve_base_uri('user:task/my-task.md', mockOptions)
      expect(result).to.equal('/mock/user/task/my-task.md')
    })

    it('should throw error for remote URIs', () => {
      expect(() => resolve_base_uri('ssh://database/config.md')).to.throw(
        /Cannot resolve remote URI/
      )
      expect(() =>
        resolve_base_uri('git://github.com/owner/repo/file.md')
      ).to.throw(/Cannot resolve remote URI/)
    })

    it('should throw error for unknown scheme', () => {
      expect(() => resolve_base_uri('unknown://path')).to.throw(
        /Unknown URI scheme/
      )
    })
  })

  describe('create_base_uri_from_path', () => {
    const mockOptions = {
      system_base_directory: '/mock/system',
      user_base_directory: '/mock/user'
    }

    it('should create user URI for user directory path', () => {
      const result = create_base_uri_from_path(
        '/mock/user/task/my-task.md',
        mockOptions
      )
      expect(result).to.equal('user:task/my-task.md')
    })

    it('should create system URI for system directory path', () => {
      const result = create_base_uri_from_path(
        '/mock/system/schema/task.md',
        mockOptions
      )
      expect(result).to.equal('sys:schema/task.md')
    })

    it('should throw error for external path', () => {
      expect(() =>
        create_base_uri_from_path('/external/path/file.md', mockOptions)
      ).to.throw(/Path outside managed repositories not supported/)
    })
  })
})
