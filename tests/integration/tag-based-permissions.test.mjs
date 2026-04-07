/* global describe it before after */
import chai from 'chai'
import path from 'path'
import fs from 'fs/promises'
import { setup_test_directories } from '#tests/utils/index.mjs'
import { check_user_permission } from '#server/middleware/permission/index.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { clear_identity_cache } from '#libs-server/users/identity-loader.mjs'
import { clear_role_cache } from '#libs-server/users/role-loader.mjs'

const expect = chai.expect

const TEST_USER_KEY =
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
const ZERO_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000'

describe('Tag-Based Permissions Integration', function () {
  this.timeout(10000)

  let test_dirs

  before(async function () {
    test_dirs = await setup_test_directories({
      system_prefix: 'test-tag-perm-system-',
      user_prefix: 'test-tag-perm-user-'
    })

    // Create role directory
    const role_dir = path.join(test_dirs.user_path, 'role')
    await fs.mkdir(role_dir, { recursive: true })

    // Create identity directory
    const identity_dir = path.join(test_dirs.user_path, 'identity')
    await fs.mkdir(identity_dir, { recursive: true })

    // Create a role with tag_rules
    await write_entity_to_filesystem({
      absolute_path: path.join(role_dir, 'league-role.md'),
      entity_properties: {
        title: 'League Role',
        type: 'role',
        base_uri: 'user:role/league-role.md',
        user_public_key: ZERO_KEY,
        rules: [
          {
            action: 'deny',
            pattern: 'user:private/**',
            reason: 'deny private'
          }
        ],
        tag_rules: [
          {
            action: 'deny',
            tag: 'user:tag/sensitive.md',
            pattern: 'user:thread/**',
            reason: 'block sensitive threads'
          },
          {
            action: 'allow',
            tag: 'user:tag/league.md',
            reason: 'league access'
          }
        ]
      },
      entity_type: 'role',
      entity_content: '# League Role'
    })

    // Create identity with the role
    await write_entity_to_filesystem({
      absolute_path: path.join(identity_dir, 'testuser.md'),
      entity_properties: {
        title: 'Test User',
        type: 'identity',
        base_uri: 'user:identity/testuser.md',
        auth_public_key: TEST_USER_KEY,
        username: 'testuser',
        user_public_key: ZERO_KEY,
        relations: ['has_role [[user:role/league-role.md]]']
      },
      entity_type: 'identity',
      entity_content: '# Test User'
    })

    // Create a tagged entity (simulating a thread with metadata)
    const thread_dir = path.join(
      test_dirs.user_path,
      'thread',
      'tagged-thread-123'
    )
    await fs.mkdir(thread_dir, { recursive: true })
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify({
        user_public_key: 'some-other-owner',
        tags: ['user:tag/league.md'],
        entity_id: 'tagged-thread-123'
      })
    )

    // Create an untagged thread
    const untagged_dir = path.join(
      test_dirs.user_path,
      'thread',
      'untagged-thread-456'
    )
    await fs.mkdir(untagged_dir, { recursive: true })
    await fs.writeFile(
      path.join(untagged_dir, 'metadata.json'),
      JSON.stringify({
        user_public_key: 'some-other-owner',
        tags: [],
        entity_id: 'untagged-thread-456'
      })
    )

    // Create a thread tagged with denied tag
    const sensitive_dir = path.join(
      test_dirs.user_path,
      'thread',
      'sensitive-thread-789'
    )
    await fs.mkdir(sensitive_dir, { recursive: true })
    await fs.writeFile(
      path.join(sensitive_dir, 'metadata.json'),
      JSON.stringify({
        user_public_key: 'some-other-owner',
        tags: ['user:tag/league.md', 'user:tag/sensitive.md'],
        entity_id: 'sensitive-thread-789'
      })
    )

    // Create a tagged entity with path deny rule
    const private_dir = path.join(test_dirs.user_path, 'private')
    await fs.mkdir(private_dir, { recursive: true })
    await write_entity_to_filesystem({
      absolute_path: path.join(private_dir, 'secret.md'),
      entity_properties: {
        title: 'Secret',
        type: 'text',
        base_uri: 'user:private/secret.md',
        user_public_key: 'some-other-owner',
        tags: ['user:tag/league.md']
      },
      entity_type: 'text',
      entity_content: '# Secret'
    })

    clear_identity_cache()
    clear_role_cache()
  })

  after(function () {
    clear_identity_cache()
    clear_role_cache()
  })

  it('should allow access to tagged thread via tag_rules', async function () {
    const result = await check_user_permission({
      user_public_key: TEST_USER_KEY,
      resource_path: 'user:thread/tagged-thread-123'
    })

    expect(result.allowed).to.be.true
    expect(result.reason).to.include('user:tag/league.md')
  })

  it('should deny access to untagged thread (no matching tag rule)', async function () {
    const result = await check_user_permission({
      user_public_key: TEST_USER_KEY,
      resource_path: 'user:thread/untagged-thread-456'
    })

    expect(result.allowed).to.be.false
  })

  it('should deny path-denied resource even with matching tag', async function () {
    const result = await check_user_permission({
      user_public_key: TEST_USER_KEY,
      resource_path: 'user:private/secret.md'
    })

    expect(result.allowed).to.be.false
    expect(result.reason).to.include('deny')
  })

  it('should deny access when tag deny rule matches', async function () {
    const result = await check_user_permission({
      user_public_key: TEST_USER_KEY,
      resource_path: 'user:thread/sensitive-thread-789'
    })

    // The deny tag rule for sensitive.md should match first since
    // tag_rules are evaluated in order and deny comes before allow in the role
    expect(result.allowed).to.be.false
    expect(result.reason).to.include('user:tag/sensitive.md')
  })
})
