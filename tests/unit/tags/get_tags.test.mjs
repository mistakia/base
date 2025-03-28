import { expect } from 'chai'
import get_tags from '#libs-server/tags/get_tags.mjs'
import create_tag from '#libs-server/tags/create_tag.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('get_tags', () => {
  let test_user
  let other_user
  const test_tags = []

  before(async () => {
    await reset_all_tables()

    // Create test users
    test_user = await create_test_user()
    other_user = await create_test_user()

    // Create several test tags for the main test user
    const tag_titles = ['First Tag', 'Second Tag', 'Archive Me', 'Search Term']

    for (const title of tag_titles) {
      const tag_id = await create_tag({
        title,
        description: `Description for ${title}`,
        user_id: test_user.user_id,
        color: '#0000FF'
      })

      test_tags.push(tag_id)
    }

    // Create a tag for the other user
    await create_tag({
      title: 'Other User Tag',
      user_id: other_user.user_id
    })

    // Archive one tag
    await db('entities')
      .where({
        entity_id: test_tags[2],
        user_id: test_user.user_id
      })
      .update({
        archived_at: new Date()
      })
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should return all unarchived tags for a user', async () => {
    const tags = await get_tags({
      user_id: test_user.user_id
    })

    expect(tags).to.be.an('array')
    expect(tags).to.have.length(3) // 4 tags created, 1 archived

    // Verify the tag data
    const titles = tags.map((tag) => tag.title)
    expect(titles).to.include('First Tag')
    expect(titles).to.include('Second Tag')
    expect(titles).to.include('Search Term')
    expect(titles).to.not.include('Archive Me') // This tag is archived
    expect(titles).to.not.include('Other User Tag') // This belongs to another user
  })

  it('should include archived tags when requested', async () => {
    const tags = await get_tags({
      user_id: test_user.user_id,
      archived: true
    })

    expect(tags).to.be.an('array')
    expect(tags).to.have.length(1) // Only the archived tag

    // Verify the tag data
    expect(tags[0].title).to.equal('Archive Me')
  })

  it('should filter tags by search term', async () => {
    const tags = await get_tags({
      user_id: test_user.user_id,
      search_term: 'Search'
    })

    expect(tags).to.be.an('array')
    expect(tags).to.have.length(1)
    expect(tags[0].title).to.equal('Search Term')
  })

  it('should return empty array when no tags match criteria', async () => {
    const tags = await get_tags({
      user_id: test_user.user_id,
      search_term: 'NonexistentTag'
    })

    expect(tags).to.be.an('array')
    expect(tags).to.have.length(0)
  })

  it('should reject invalid user ID', async () => {
    try {
      await get_tags({
        user_id: 'not-a-valid-uuid'
      })
      expect.fail('Should have thrown an error for invalid user ID')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })
})
