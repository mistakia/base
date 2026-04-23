import { expect } from 'chai'
import {
  get_user_container_name,
  get_user_container_claude_home,
  get_user_data_directory,
  resolve_account_host_path,
  translate_container_transcript_path
} from '#libs-server/threads/user-container-manager.mjs'

describe('user-container-manager', function () {
  this.timeout(10000)

  describe('get_user_container_name', () => {
    it('should derive container name from username', () => {
      const name = get_user_container_name({ username: 'greg' })
      expect(name).to.equal('base-user-greg')
    })

    it('should handle hyphenated usernames', () => {
      const name = get_user_container_name({ username: 'test-user' })
      expect(name).to.equal('base-user-test-user')
    })

    it('should always use base-user- prefix', () => {
      const name = get_user_container_name({ username: 'alice' })
      expect(name).to.match(/^base-user-/)
    })
  })

  describe('get_user_data_directory', () => {
    it('should return a string path', () => {
      const dir = get_user_data_directory()
      expect(dir).to.be.a('string')
      expect(dir.length).to.be.greaterThan(0)
    })
  })

  describe('get_user_container_claude_home', () => {
    it('should include username in path', () => {
      const home = get_user_container_claude_home({ username: 'greg' })
      expect(home).to.include('greg')
      expect(home).to.include('claude-home')
    })

    it('should produce different paths for different users', () => {
      const home_a = get_user_container_claude_home({ username: 'alice' })
      const home_b = get_user_container_claude_home({ username: 'bob' })
      expect(home_a).to.not.equal(home_b)
    })

    it('should end with claude-home', () => {
      const home = get_user_container_claude_home({ username: 'test' })
      expect(home).to.match(/claude-home$/)
    })
  })

  describe('resolve_account_host_path', () => {
    const data_dir = get_user_data_directory()

    it('returns claude-home for null container_config_dir', () => {
      const path = resolve_account_host_path({
        username: 'arrin',
        container_config_dir: null
      })
      expect(path).to.equal(`${data_dir}/arrin/claude-home`)
    })

    it('returns claude-home for primary /home/node/.claude', () => {
      const path = resolve_account_host_path({
        username: 'arrin',
        container_config_dir: '/home/node/.claude'
      })
      expect(path).to.equal(`${data_dir}/arrin/claude-home`)
    })

    it('strips leading dot for secondary account', () => {
      const path = resolve_account_host_path({
        username: 'arrin',
        container_config_dir: '/home/node/.claude-earn.crop.code'
      })
      expect(path).to.equal(`${data_dir}/arrin/claude-earn.crop.code`)
    })

    it('handles trailing slash on container_config_dir', () => {
      const path = resolve_account_host_path({
        username: 'arrin',
        container_config_dir: '/home/node/.claude-earn.crop.code/'
      })
      expect(path).to.equal(`${data_dir}/arrin/claude-earn.crop.code`)
    })

    it('matches get_user_container_claude_home for primary case', () => {
      const a = get_user_container_claude_home({ username: 'arrin' })
      const b = resolve_account_host_path({
        username: 'arrin',
        container_config_dir: null
      })
      expect(a).to.equal(b)
    })
  })

  describe('translate_container_transcript_path', () => {
    const data_dir = get_user_data_directory()

    it('translates primary transcript path', () => {
      const result = translate_container_transcript_path({
        username: 'arrin',
        transcript_path: '/home/node/.claude/projects/foo/abc.jsonl'
      })
      expect(result).to.deep.equal({
        host_path: `${data_dir}/arrin/claude-home/projects/foo/abc.jsonl`
      })
    })

    it('translates secondary transcript path', () => {
      const result = translate_container_transcript_path({
        username: 'arrin',
        transcript_path:
          '/home/node/.claude-earn.crop.code/projects/foo/abc.jsonl'
      })
      expect(result).to.deep.equal({
        host_path: `${data_dir}/arrin/claude-earn.crop.code/projects/foo/abc.jsonl`
      })
    })

    it('rejects path outside /home/node/', () => {
      const result = translate_container_transcript_path({
        username: 'arrin',
        transcript_path: '/etc/passwd'
      })
      expect(result.error).to.include('/home/node/')
      expect(result.host_path).to.be.undefined
    })

    it('rejects non-.claude config segment', () => {
      const result = translate_container_transcript_path({
        username: 'arrin',
        transcript_path: '/home/node/.ssh/projects/foo/abc.jsonl'
      })
      expect(result.error).to.include('.claude')
      expect(result.host_path).to.be.undefined
    })

    it('rejects .. traversal segments', () => {
      const result = translate_container_transcript_path({
        username: 'arrin',
        transcript_path: '/home/node/.claude/../../../etc/passwd'
      })
      expect(result.error).to.include('..')
      expect(result.host_path).to.be.undefined
    })
  })
})
