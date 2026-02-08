import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { run_migration } from '../../cli/migrate-users-to-entities.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'
import { clear_identity_cache } from '#libs-server/users/identity-loader.mjs'
import { clear_role_cache } from '#libs-server/users/role-loader.mjs'

describe('migrate-users-to-entities', function () {
  this.timeout(30000)

  let temp_dir

  beforeEach(async () => {
    // Create temp directory structure
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'))

    // Register temp directory as user base
    clear_registered_directories()
    register_user_base_directory(temp_dir)

    // Clear caches
    clear_identity_cache()
    clear_role_cache()
  })

  afterEach(async () => {
    clear_identity_cache()
    clear_role_cache()
    clear_registered_directories()
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  describe('run_migration', () => {
    it('should handle empty users.json', async () => {
      // Create empty users.json
      const users_path = path.join(temp_dir, 'users.json')
      await fs.writeFile(users_path, JSON.stringify({ users: {} }))

      const result = await run_migration({ dry_run: true })

      expect(result.success).to.be.true
      expect(result.migrated).to.equal(0)
    })

    it('should migrate admin user correctly', async () => {
      // Create users.json with admin user
      const users_path = path.join(temp_dir, 'users.json')
      const users_data = {
        users: {
          adminkey123: {
            username: 'admin',
            created_at: '2025-01-01T00:00:00.000Z',
            permissions: {
              create_threads: true,
              global_write: true,
              rules: [{ action: 'allow', pattern: '**/*' }]
            }
          }
        }
      }
      await fs.writeFile(users_path, JSON.stringify(users_data))

      const result = await run_migration({ dry_run: false })

      expect(result.success).to.be.true
      expect(result.migrated).to.equal(1)

      // Verify admin role was created
      const admin_role_path = path.join(temp_dir, 'role', 'admin.md')
      const admin_role = await read_entity_from_filesystem({
        absolute_path: admin_role_path
      })
      expect(admin_role.success).to.be.true
      expect(admin_role.entity_properties.title).to.equal('Admin')
      expect(admin_role.entity_properties.rules).to.have.lengthOf(1)
      expect(admin_role.entity_properties.rules[0].pattern).to.equal('**/*')

      // Verify admin identity was created
      const admin_identity_path = path.join(temp_dir, 'identity', 'admin.md')
      const admin_identity = await read_entity_from_filesystem({
        absolute_path: admin_identity_path
      })
      expect(admin_identity.success).to.be.true
      expect(admin_identity.entity_properties.username).to.equal('admin')
      expect(admin_identity.entity_properties.auth_public_key).to.equal(
        'adminkey123'
      )
      expect(admin_identity.entity_properties.relations).to.include(
        'has_role [[user:role/admin.md]]'
      )
    })

    it('should migrate public user to _public identity', async () => {
      // Create users.json with public user
      const users_path = path.join(temp_dir, 'users.json')
      const users_data = {
        users: {
          public: {
            username: 'public',
            created_at: '2025-01-01T00:00:00.000Z',
            permissions: {
              rules: [
                { action: 'allow', pattern: 'sys:system/**' },
                { action: 'allow', pattern: 'user:workflow/**' }
              ]
            }
          }
        }
      }
      await fs.writeFile(users_path, JSON.stringify(users_data))

      const result = await run_migration({ dry_run: false })

      expect(result.success).to.be.true

      // Verify public-reader role was created
      const reader_role_path = path.join(temp_dir, 'role', 'public-reader.md')
      const reader_role = await read_entity_from_filesystem({
        absolute_path: reader_role_path
      })
      expect(reader_role.success).to.be.true
      expect(reader_role.entity_properties.title).to.equal('Public Reader')
      expect(reader_role.entity_properties.rules).to.have.lengthOf(2)

      // Verify _public identity was created
      const public_identity_path = path.join(temp_dir, 'identity', 'public.md')
      const public_identity = await read_entity_from_filesystem({
        absolute_path: public_identity_path
      })
      expect(public_identity.success).to.be.true
      expect(public_identity.entity_properties.username).to.equal('public')
      expect(public_identity.entity_properties.relations).to.include(
        'has_role [[user:role/public-reader.md]]'
      )
    })

    it('should migrate non-admin user with custom rules', async () => {
      // Create users.json with non-admin user
      const users_path = path.join(temp_dir, 'users.json')
      const users_data = {
        users: {
          userkey456: {
            username: 'customuser',
            created_at: '2025-01-01T00:00:00.000Z',
            permissions: {
              create_threads: true,
              rules: [
                { action: 'allow', pattern: 'user:task/**' },
                { action: 'deny', pattern: 'user:private/**' }
              ]
            }
          }
        }
      }
      await fs.writeFile(users_path, JSON.stringify(users_data))

      const result = await run_migration({ dry_run: false })

      expect(result.success).to.be.true

      // Verify identity was created with user-specific rules
      const identity_path = path.join(temp_dir, 'identity', 'customuser.md')
      const identity = await read_entity_from_filesystem({
        absolute_path: identity_path
      })
      expect(identity.success).to.be.true
      expect(identity.entity_properties.username).to.equal('customuser')
      expect(identity.entity_properties.permissions.create_threads).to.be.true
      expect(identity.entity_properties.rules).to.have.lengthOf(2)
    })

    it('should backup users.json', async () => {
      // Create users.json
      const users_path = path.join(temp_dir, 'users.json')
      const users_data = {
        users: {
          testkey: {
            username: 'test',
            created_at: '2025-01-01T00:00:00.000Z'
          }
        }
      }
      await fs.writeFile(users_path, JSON.stringify(users_data))

      await run_migration({ dry_run: false })

      // Verify backup was created
      const backup_path = path.join(temp_dir, 'users.json.backup')
      const backup_exists = await fs
        .stat(backup_path)
        .then(() => true)
        .catch(() => false)
      expect(backup_exists).to.be.true

      // Verify backup content matches original
      const backup_content = await fs.readFile(backup_path, 'utf8')
      const backup_data = JSON.parse(backup_content)
      expect(backup_data.users.testkey.username).to.equal('test')
    })

    it('should not create files in dry run mode', async () => {
      // Create users.json
      const users_path = path.join(temp_dir, 'users.json')
      const users_data = {
        users: {
          testkey: {
            username: 'test',
            created_at: '2025-01-01T00:00:00.000Z',
            permissions: {
              rules: [{ action: 'allow', pattern: '**/*' }]
            }
          }
        }
      }
      await fs.writeFile(users_path, JSON.stringify(users_data))

      const result = await run_migration({ dry_run: true })

      expect(result.success).to.be.true

      // Verify no identity directory was created
      const identity_dir = path.join(temp_dir, 'identity')
      const identity_exists = await fs
        .stat(identity_dir)
        .then((s) => s.isDirectory())
        .catch(() => false)
      // Directory might exist but should be empty or not have the expected file
      if (identity_exists) {
        const files = await fs.readdir(identity_dir)
        expect(files).to.have.lengthOf(0)
      }
    })
  })
})
