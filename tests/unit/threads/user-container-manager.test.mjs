import { expect } from 'chai'
import {
  get_user_container_name,
  get_user_container_claude_home,
  get_user_data_directory
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
})
