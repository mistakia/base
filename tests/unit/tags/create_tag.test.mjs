import { expect } from 'chai'

import create_tag from '#libs-server/tags/create_tag.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('create_tag', () => {
  let test_user

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should create a tag with minimal required fields', async () => {
    const tag_data = {
      title: 'Minimal Tag',
      user_id: test_user.user_id
    }

    const tag_id = await create_tag(tag_data)

    expect(tag_id).to.be.a('string')

    // Verify the tag was created in the database
    const entity = await db('entities')
      .where({
        entity_id: tag_id,
        type: 'tag'
      })
      .first()

    expect(entity).to.exist
    expect(entity.title).to.equal(tag_data.title)
    expect(entity.description).to.equal('')

    const tag = await db('tags')
      .where({
        entity_id: tag_id
      })
      .first()

    expect(tag).to.exist
    expect(tag.color).to.be.null
  })

  it('should create a tag with all fields', async () => {
    const tag_data = {
      title: 'Complete Tag',
      description: 'A tag with all fields',
      user_id: test_user.user_id,
      color: '#FF0000'
    }

    const tag_id = await create_tag(tag_data)

    expect(tag_id).to.be.a('string')

    // Verify the tag was created in the database
    const entity = await db('entities')
      .where({
        entity_id: tag_id,
        type: 'tag'
      })
      .first()

    expect(entity).to.exist
    expect(entity.title).to.equal(tag_data.title)
    expect(entity.description).to.equal(tag_data.description)

    const tag = await db('tags')
      .where({
        entity_id: tag_id
      })
      .first()

    expect(tag).to.exist
    expect(tag.color).to.equal(tag_data.color)
  })

  it('should reject invalid input', async () => {
    const invalid_tag_data = {
      title: 'Invalid Tag',
      user_id: 'not-a-valid-uuid' // Invalid user ID
    }

    try {
      await create_tag(invalid_tag_data)
      // Should not reach here
      expect.fail('Should have thrown an error for invalid input')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })
})
