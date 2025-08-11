#!/usr/bin/env node

import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'

import config from '#config'

const log = debug('verify-export')
log.enabled = true

const verify_postgres_export = async () => {
  const start_time = Date.now()

  try {
    log('Starting PostgreSQL export verification...')

    // Determine export path
    const user_base_dir =
      config.user_base_directory || process.env.USER_BASE_DIRECTORY
    if (!user_base_dir) {
      throw new Error('USER_BASE_DIRECTORY not configured')
    }

    const export_path = path.join(user_base_dir, '.system', 'users.json')

    // Check if export file exists
    try {
      await fs.access(export_path)
    } catch (error) {
      throw new Error(`Export file not found: ${export_path}`)
    }

    log(`Reading export file: ${export_path}`)

    // Read and parse export data
    let export_data
    try {
      const file_content = await fs.readFile(export_path, 'utf8')
      export_data = JSON.parse(file_content)
    } catch (error) {
      throw new Error(`Failed to parse export file: ${error.message}`)
    }

    // Validate export structure
    const required_fields = [
      'export_timestamp',
      'export_version',
      'source_database',
      'users'
    ]
    for (const field of required_fields) {
      if (!(field in export_data)) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    log('Export structure valid')

    // Validate users array
    if (!Array.isArray(export_data.users)) {
      throw new Error('users field must be an array')
    }

    log(`Found ${export_data.users.length} users in export`)

    // Validate user records
    const required_user_fields = [
      'user_id',
      'username',
      'public_key',
      'email',
      'created_at',
      'updated_at'
    ]
    const public_keys = new Set()
    const user_ids = new Set()

    for (let i = 0; i < export_data.users.length; i++) {
      const user = export_data.users[i]

      // Check required fields
      for (const field of required_user_fields) {
        if (!(field in user)) {
          throw new Error(`User ${i}: Missing required field: ${field}`)
        }
      }

      // Check for duplicate public keys
      if (public_keys.has(user.public_key)) {
        throw new Error(`User ${i}: Duplicate public key: ${user.public_key}`)
      }
      public_keys.add(user.public_key)

      // Check for duplicate user IDs
      if (user_ids.has(user.user_id)) {
        throw new Error(`User ${i}: Duplicate user_id: ${user.user_id}`)
      }
      user_ids.add(user.user_id)

      // Validate public key format (should be 64 hex characters)
      if (!/^[a-f0-9]{64}$/i.test(user.public_key)) {
        throw new Error(
          `User ${i}: Invalid public key format: ${user.public_key}`
        )
      }

      // Validate timestamps
      if (user.created_at && !Date.parse(user.created_at)) {
        throw new Error(
          `User ${i}: Invalid created_at timestamp: ${user.created_at}`
        )
      }

      if (user.updated_at && !Date.parse(user.updated_at)) {
        throw new Error(
          `User ${i}: Invalid updated_at timestamp: ${user.updated_at}`
        )
      }
    }

    // Validate JSON structure integrity
    const json_string = JSON.stringify(export_data)
    const reparsed_data = JSON.parse(json_string)

    if (reparsed_data.users.length !== export_data.users.length) {
      throw new Error('JSON structure integrity check failed')
    }

    const duration = Date.now() - start_time

    log('Verification completed successfully!')
    log(`Verified ${export_data.users.length} users`)
    log(`Export timestamp: ${export_data.export_timestamp}`)
    log(`Source database: ${export_data.source_database}`)
    log(`Duration: ${duration}ms`)

    // Print summary to stdout
    console.log('PostgreSQL export verification completed successfully')
    console.log(`Users verified: ${export_data.users.length}`)
    console.log(`Export file: ${export_path}`)
    console.log(`Export timestamp: ${export_data.export_timestamp}`)
    console.log(`Source database: ${export_data.source_database}`)
    console.log(`Duration: ${duration}ms`)

    return {
      success: true,
      user_count: export_data.users.length,
      export_path,
      export_timestamp: export_data.export_timestamp
    }
  } catch (error) {
    log('Verification failed:', error.message)
    console.error('Verification failed:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === 'file://' + process.argv[1]) {
  verify_postgres_export()
}

export default verify_postgres_export
