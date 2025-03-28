import { expect } from 'chai'
import update_tag from '#libs-server/tags/update_tag.mjs'
import create_tag from '#libs-server/tags/create_tag.mjs'
import { get_tag_by_id } from '#libs-server/tags/get_tag.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('update_tag', () => {
  let test_user
  let other_user
  let test_tag_id

  before(async () => {
    await reset_all_tables()

    // Create test users
    test_user = await create_test_user()
    other_user = await create_test_user()

    // Create a test tag
    test_tag_id = await create_tag({
      title: 'Original Title',
      description: 'Original description',
      user_id: test_user.user_id,
      color: '#123456'
    })
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should update a tag title', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      title: 'Updated Title'
    })

    expect(success).to.be.true

    // Verify the tag was updated
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(tag.title).to.equal('Updated Title')
    expect(tag.description).to.equal('Original description') // Unchanged
    expect(tag.color).to.equal('#123456') // Unchanged
  })

  it('should update a tag description', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      description: 'Updated description'
    })

    expect(success).to.be.true

    // Verify the tag was updated
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(tag.title).to.equal('Updated Title') // From previous test
    expect(tag.description).to.equal('Updated description')
    expect(tag.color).to.equal('#123456') // Unchanged
  })

  it('should update a tag color', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      color: '#ABCDEF'
    })

    expect(success).to.be.true

    // Verify the tag was updated
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(tag.title).to.equal('Updated Title') // From previous test
    expect(tag.description).to.equal('Updated description') // From previous test
    expect(tag.color).to.equal('#ABCDEF')
  })

  it('should update multiple tag properties at once', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      title: 'Multi-Updated Title',
      description: 'Multi-updated description',
      color: '#999999'
    })

    expect(success).to.be.true

    // Verify the tag was updated
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(tag.title).to.equal('Multi-Updated Title')
    expect(tag.description).to.equal('Multi-updated description')
    expect(tag.color).to.equal('#999999')
  })

  it('should archive a tag', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      archive: true
    })

    expect(success).to.be.true

    // Verify the tag was archived
    const entity = await db('entities')
      .where({
        entity_id: test_tag_id
      })
      .first()

    expect(entity.archived_at).to.not.be.null
  })

  it('should unarchive a tag', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      archive: false
    })

    expect(success).to.be.true

    // Verify the tag was unarchived
    const entity = await db('entities')
      .where({
        entity_id: test_tag_id
      })
      .first()

    expect(entity.archived_at).to.be.null
  })

  it('should return false when tag does not exist', async () => {
    const fake_id = '00000000-0000-0000-0000-000000000000'
    const success = await update_tag({
      tag_id: fake_id,
      user_id: test_user.user_id,
      title: "Won't Update"
    })

    expect(success).to.be.false
  })

  it('should return false when tag belongs to different user', async () => {
    const success = await update_tag({
      tag_id: test_tag_id,
      user_id: other_user.user_id,
      title: "Won't Update"
    })

    expect(success).to.be.false

    // Verify the tag was not updated
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(tag.title).to.equal('Multi-Updated Title') // Still the previous value
  })

  it('should reject invalid tag ID', async () => {
    try {
      await update_tag({
        tag_id: 'not-a-valid-uuid',
        user_id: test_user.user_id,
        title: 'Error Test'
      })
      expect.fail('Should have thrown an error for invalid tag ID')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })
})
