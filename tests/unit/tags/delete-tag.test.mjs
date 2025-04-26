import { expect } from 'chai'
import delete_tag from '#libs-server/tags/delete-tag.mjs'
import create_tag from '#libs-server/tags/create-tag.mjs'
import { get_tag_by_id } from '#libs-server/tags/get-tag.mjs'
import { tag_entity } from '#libs-server/tags/tag-entity.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('delete_tag', () => {
  let test_user
  let other_user
  let test_tag_id
  let test_entity_id

  beforeEach(async () => {
    await reset_all_tables()

    // Create test users
    test_user = await create_test_user()
    other_user = await create_test_user()

    // Create a test tag
    test_tag_id = await create_tag({
      title: 'Test Tag',
      description: 'A tag to be deleted',
      user_id: test_user.user_id,
      color: '#FF0000'
    })

    // Create a test entity for tagging
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity',
        description: 'For testing tag deletion',
        user_id: test_user.user_id,
        type: 'task'
      })
      .returning('entity_id')

    test_entity_id = entity.entity_id

    // Create task extension record
    await db('tasks').insert({
      entity_id: test_entity_id,
      status: 'No status'
    })

    // Tag the entity
    await tag_entity({
      entity_id: test_entity_id,
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should delete a tag and all its associations', async () => {
    // Verify setup
    const before_tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })
    expect(before_tag).to.not.be.null

    // Verify association exists
    const before_assoc = await db('entity_tags')
      .where({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })
      .first()
    expect(before_assoc).to.exist

    // Delete the tag
    const success = await delete_tag({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(success).to.be.true

    // Verify tag no longer exists
    const after_tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })
    expect(after_tag).to.be.null

    // Verify tag record is gone
    const tag_record = await db('tags')
      .where({ entity_id: test_tag_id })
      .first()
    expect(tag_record).to.be.undefined

    // Verify entity record is gone
    const entity_record = await db('entities')
      .where({ entity_id: test_tag_id })
      .first()
    expect(entity_record).to.be.undefined

    // Verify associations are gone
    const after_assoc = await db('entity_tags')
      .where({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })
      .first()
    expect(after_assoc).to.be.undefined
  })

  it('should return false when tag does not exist', async () => {
    const fake_id = '00000000-0000-0000-0000-000000000000'
    const success = await delete_tag({
      tag_id: fake_id,
      user_id: test_user.user_id
    })

    expect(success).to.be.false
  })

  it('should return false when tag belongs to different user', async () => {
    const success = await delete_tag({
      tag_id: test_tag_id,
      user_id: other_user.user_id
    })

    expect(success).to.be.false

    // Verify tag still exists
    const tag = await get_tag_by_id({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })
    expect(tag).to.not.be.null
  })

  it('should reject invalid tag ID', async () => {
    try {
      await delete_tag({
        tag_id: 'not-a-valid-uuid',
        user_id: test_user.user_id
      })
      expect.fail('Should have thrown an error for invalid tag ID')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })
})
