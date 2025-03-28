import { expect } from 'chai'
import { get_tag_by_id, get_tag_by_name } from '#libs-server/tags/get_tag.mjs'
import create_tag from '#libs-server/tags/create_tag.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('get_tag functions', () => {
  let test_user
  let test_tag_id

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create a test tag
    test_tag_id = await create_tag({
      title: 'Test Tag',
      description: 'A test tag for get_tag tests',
      user_id: test_user.user_id,
      color: '#00FF00'
    })
  })

  after(async () => {
    await reset_all_tables()
  })

  describe('get_tag_by_id', () => {
    it('should return a tag when found by ID', async () => {
      const tag = await get_tag_by_id({
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(tag).to.be.an('object')
      expect(tag.tag_id).to.equal(test_tag_id)
      expect(tag.title).to.equal('Test Tag')
      expect(tag.description).to.equal('A test tag for get_tag tests')
      expect(tag.color).to.equal('#00FF00')
      expect(tag.user_id).to.equal(test_user.user_id)
    })

    it('should return null when tag ID not found', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const tag = await get_tag_by_id({
        tag_id: fake_id,
        user_id: test_user.user_id
      })

      expect(tag).to.be.null
    })

    it('should return null when tag belongs to different user', async () => {
      // Create another user
      const another_user = await create_test_user()

      const tag = await get_tag_by_id({
        tag_id: test_tag_id,
        user_id: another_user.user_id
      })

      expect(tag).to.be.null
    })

    it('should reject invalid parameters', async () => {
      try {
        await get_tag_by_id({
          tag_id: 'not-a-valid-uuid',
          user_id: test_user.user_id
        })
        expect.fail('Should have thrown an error for invalid parameters')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })

  describe('get_tag_by_name', () => {
    it('should return a tag when found by name', async () => {
      const tag = await get_tag_by_name({
        title: 'Test Tag',
        user_id: test_user.user_id
      })

      expect(tag).to.be.an('object')
      expect(tag.tag_id).to.equal(test_tag_id)
      expect(tag.title).to.equal('Test Tag')
      expect(tag.description).to.equal('A test tag for get_tag tests')
      expect(tag.color).to.equal('#00FF00')
      expect(tag.user_id).to.equal(test_user.user_id)
    })

    it('should return null when tag name not found', async () => {
      const tag = await get_tag_by_name({
        title: 'Nonexistent Tag',
        user_id: test_user.user_id
      })

      expect(tag).to.be.null
    })

    it('should return null when tag belongs to different user', async () => {
      // Create another user
      const another_user = await create_test_user()

      const tag = await get_tag_by_name({
        title: 'Test Tag',
        user_id: another_user.user_id
      })

      expect(tag).to.be.null
    })

    it('should reject missing parameters', async () => {
      try {
        await get_tag_by_name({
          // Missing title
          user_id: test_user.user_id
        })
        expect.fail('Should have thrown an error for missing parameters')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })
})
