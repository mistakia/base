/**
 * Kuzu Schema Definitions
 *
 * Defines node and relationship tables for the entity graph.
 */

import debug from 'debug'

const log = debug('embedded-index:kuzu:schema')

const ENTITY_NODE_SCHEMA = `
CREATE NODE TABLE IF NOT EXISTS Entity (
  base_uri STRING PRIMARY KEY,
  entity_id STRING,
  type STRING,
  title STRING,
  user_public_key STRING,
  created_at STRING,
  updated_at STRING
)
`

const TAG_NODE_SCHEMA = `
CREATE NODE TABLE IF NOT EXISTS Tag (
  base_uri STRING PRIMARY KEY,
  title STRING
)
`

const HAS_TAG_RELATIONSHIP_SCHEMA = `
CREATE REL TABLE IF NOT EXISTS HAS_TAG (
  FROM Entity TO Tag
)
`

const RELATES_TO_RELATIONSHIP_SCHEMA = `
CREATE REL TABLE IF NOT EXISTS RELATES_TO (
  FROM Entity TO Entity,
  relation_type STRING,
  context STRING
)
`

export async function create_kuzu_schema({ connection }) {
  log('Creating Kuzu schema')

  try {
    // Create node tables (use query() for DDL statements)
    await connection.query(ENTITY_NODE_SCHEMA)
    log('Entity node table created')

    await connection.query(TAG_NODE_SCHEMA)
    log('Tag node table created')

    // Create relationship tables
    await connection.query(HAS_TAG_RELATIONSHIP_SCHEMA)
    log('HAS_TAG relationship table created')

    await connection.query(RELATES_TO_RELATIONSHIP_SCHEMA)
    log('RELATES_TO relationship table created')

    log('Kuzu schema creation complete')
  } catch (error) {
    log('Error creating Kuzu schema: %s', error.message)
    throw error
  }
}

export async function drop_kuzu_schema({ connection }) {
  log('Dropping Kuzu schema')

  try {
    // Drop relationship tables first (they depend on node tables)
    try {
      await connection.query('DROP TABLE IF EXISTS RELATES_TO')
    } catch (e) {
      log('RELATES_TO table may not exist: %s', e.message)
    }

    try {
      await connection.query('DROP TABLE IF EXISTS HAS_TAG')
    } catch (e) {
      log('HAS_TAG table may not exist: %s', e.message)
    }

    // Drop node tables
    try {
      await connection.query('DROP TABLE IF EXISTS Tag')
    } catch (e) {
      log('Tag table may not exist: %s', e.message)
    }

    try {
      await connection.query('DROP TABLE IF EXISTS Entity')
    } catch (e) {
      log('Entity table may not exist: %s', e.message)
    }

    log('Kuzu schema dropped')
  } catch (error) {
    log('Error dropping Kuzu schema: %s', error.message)
    throw error
  }
}

export const KUZU_SCHEMA = {
  ENTITY_NODE_SCHEMA,
  TAG_NODE_SCHEMA,
  HAS_TAG_RELATIONSHIP_SCHEMA,
  RELATES_TO_RELATIONSHIP_SCHEMA
}
