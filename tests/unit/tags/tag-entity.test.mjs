import { expect } from 'chai'
import { tag_entity, untag_entity } from '#libs-server/tags/tag-entity.mjs'
import create_tag from '#libs-server/tags/create-tag.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('tag_entity functions', () => {
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
      description: 'A tag for testing tagging functions',
      user_id: test_user.user_id,
      color: '#00FF00'
    })

    // Create a test entity
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity',
        description: 'For testing tagging functions',
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
  })

  after(async () => {
    await reset_all_tables()
  })

  describe('tag_entity', () => {
    it('should tag an entity', async () => {
      const success = await tag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.true

      // Verify the entity was tagged
      const assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(assoc).to.exist
    })

    it('should return true if entity is already tagged (idempotent)', async () => {
      // Tag the entity first
      await db('entity_tags').insert({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })

      // Try tagging again
      const success = await tag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.true

      // Verify there's only one association (no duplicates)
      const assocs = await db('entity_tags').where({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })

      expect(assocs).to.have.length(1)
    })

    it('should return false when tag does not exist', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const success = await tag_entity({
        entity_id: test_entity_id,
        tag_id: fake_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.false

      // Verify no association was created
      const assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: fake_id
        })
        .first()

      expect(assoc).to.be.undefined
    })

    it('should return false when entity does not exist', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const success = await tag_entity({
        entity_id: fake_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.false

      // Verify no association was created
      const assoc = await db('entity_tags')
        .where({
          entity_id: fake_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(assoc).to.be.undefined
    })

    it('should return false when user does not own tag', async () => {
      const success = await tag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: other_user.user_id
      })

      expect(success).to.be.false

      // Verify no association was created
      const assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(assoc).to.be.undefined
    })

    it('should reject invalid parameters', async () => {
      try {
        await tag_entity({
          entity_id: 'not-a-valid-uuid',
          tag_id: test_tag_id,
          user_id: test_user.user_id
        })
        expect.fail('Should have thrown an error for invalid entity ID')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })

  describe('untag_entity', () => {
    it('should untag an entity', async () => {
      // Tag the entity first
      await db('entity_tags').insert({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })

      // Verify setup
      const before_assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(before_assoc).to.exist

      // Untag the entity
      const success = await untag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.true

      // Verify the entity was untagged
      const after_assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(after_assoc).to.be.undefined
    })

    it('should succeed even if entity is not tagged (idempotent)', async () => {
      // Verify entity is not tagged
      const before_assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(before_assoc).to.be.undefined

      // Try untagging
      const success = await untag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.true
    })

    it('should return false when tag does not exist', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const success = await untag_entity({
        entity_id: test_entity_id,
        tag_id: fake_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.false
    })

    it('should return false when entity does not exist', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const success = await untag_entity({
        entity_id: fake_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })

      expect(success).to.be.false
    })

    it('should return false when user does not own tag', async () => {
      // Tag the entity first
      await db('entity_tags').insert({
        entity_id: test_entity_id,
        tag_entity_id: test_tag_id
      })

      const success = await untag_entity({
        entity_id: test_entity_id,
        tag_id: test_tag_id,
        user_id: other_user.user_id
      })

      expect(success).to.be.false

      // Verify the entity is still tagged
      const assoc = await db('entity_tags')
        .where({
          entity_id: test_entity_id,
          tag_entity_id: test_tag_id
        })
        .first()

      expect(assoc).to.exist
    })

    it('should reject missing parameters', async () => {
      try {
        await untag_entity({
          // Missing entity_id
          tag_id: test_tag_id,
          user_id: test_user.user_id
        })
        expect.fail('Should have thrown an error for missing entity ID')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })
})
