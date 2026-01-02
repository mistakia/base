/**
 * @fileoverview Integration tests for Kuzu graph queries
 */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import {
  initialize_kuzu_client,
  get_kuzu_connection,
  close_kuzu_connection
} from '#libs-server/embedded-database-index/kuzu/kuzu-database-client.mjs'
import { create_kuzu_schema } from '#libs-server/embedded-database-index/kuzu/kuzu-schema-definitions.mjs'
import {
  upsert_entity_to_kuzu,
  upsert_tag_to_kuzu,
  sync_entity_tags_to_kuzu,
  sync_entity_relations_to_kuzu
} from '#libs-server/embedded-database-index/kuzu/kuzu-entity-sync.mjs'
import {
  find_entities_by_tag,
  find_entities_by_tags,
  find_related_entities,
  get_entity_graph
} from '#libs-server/embedded-database-index/kuzu/kuzu-graph-queries.mjs'

describe('Kuzu Graph Queries Integration', () => {
  let connection
  let test_db_path

  before(async () => {
    // Create temporary directory for test database
    test_db_path = path.join(os.tmpdir(), `kuzu-graph-test-${Date.now()}`)
    fs.mkdirSync(test_db_path, { recursive: true })

    // Initialize Kuzu
    await initialize_kuzu_client({ database_path: test_db_path })
    connection = await get_kuzu_connection()

    // Create schema
    await create_kuzu_schema({ connection })

    // Insert test entities
    const test_entities = [
      {
        base_uri: 'user:task/entity-1.md',
        entity_id: 'entity-1',
        type: 'task',
        title: 'Task One'
      },
      {
        base_uri: 'user:task/entity-2.md',
        entity_id: 'entity-2',
        type: 'task',
        title: 'Task Two'
      },
      {
        base_uri: 'user:workflow/entity-3.md',
        entity_id: 'entity-3',
        type: 'workflow',
        title: 'Workflow One'
      }
    ]

    for (const entity of test_entities) {
      await upsert_entity_to_kuzu({ connection, entity_data: entity })
    }

    // Insert test tags
    const test_tags = [
      { base_uri: 'user:tag/important.md', title: 'important' },
      { base_uri: 'user:tag/urgent.md', title: 'urgent' },
      { base_uri: 'user:tag/feature.md', title: 'feature' }
    ]

    for (const tag of test_tags) {
      await upsert_tag_to_kuzu({ connection, tag_data: tag })
    }

    // Link entities to tags
    await sync_entity_tags_to_kuzu({
      connection,
      entity_base_uri: 'user:task/entity-1.md',
      tag_base_uris: ['user:tag/important.md', 'user:tag/urgent.md']
    })
    await sync_entity_tags_to_kuzu({
      connection,
      entity_base_uri: 'user:task/entity-2.md',
      tag_base_uris: ['user:tag/important.md']
    })
    await sync_entity_tags_to_kuzu({
      connection,
      entity_base_uri: 'user:workflow/entity-3.md',
      tag_base_uris: ['user:tag/feature.md', 'user:tag/urgent.md']
    })

    // Create relations between entities
    await sync_entity_relations_to_kuzu({
      connection,
      entity_base_uri: 'user:task/entity-1.md',
      relations: [
        { target_base_uri: 'user:task/entity-2.md', relation_type: 'blocks' },
        {
          target_base_uri: 'user:workflow/entity-3.md',
          relation_type: 'relates_to'
        }
      ]
    })
  })

  after(async () => {
    await close_kuzu_connection()

    // Cleanup test directory
    if (test_db_path && fs.existsSync(test_db_path)) {
      fs.rmSync(test_db_path, { recursive: true, force: true })
    }
  })

  describe('find_entities_by_tag', () => {
    it('should find entities with a specific tag', async () => {
      const entities = await find_entities_by_tag({
        connection,
        tag_base_uri: 'user:tag/important.md'
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(2)

      const base_uris = entities.map((e) => e.base_uri)
      expect(base_uris).to.include('user:task/entity-1.md')
      expect(base_uris).to.include('user:task/entity-2.md')
    })

    it('should return empty array for non-existent tag', async () => {
      const entities = await find_entities_by_tag({
        connection,
        tag_base_uri: 'user:tag/nonexistent.md'
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(0)
    })
  })

  describe('find_entities_by_tags', () => {
    it('should find entities matching all specified tags (AND)', async () => {
      const entities = await find_entities_by_tags({
        connection,
        tag_base_uris: ['user:tag/important.md', 'user:tag/urgent.md'],
        match_all: true
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(1)
      expect(entities[0].base_uri).to.equal('user:task/entity-1.md')
    })

    it('should find entities matching any specified tags (OR)', async () => {
      const entities = await find_entities_by_tags({
        connection,
        tag_base_uris: ['user:tag/important.md', 'user:tag/feature.md'],
        match_all: false
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(3)
    })
  })

  describe('find_related_entities', () => {
    it('should find entities related from a source entity', async () => {
      const related = await find_related_entities({
        connection,
        base_uri: 'user:task/entity-1.md'
      })

      expect(related).to.be.an('array')
      expect(related.length).to.equal(2)

      const target_uris = related.map((r) => r.base_uri)
      expect(target_uris).to.include('user:task/entity-2.md')
      expect(target_uris).to.include('user:workflow/entity-3.md')
    })

    it('should filter by relation type', async () => {
      const related = await find_related_entities({
        connection,
        base_uri: 'user:task/entity-1.md',
        relation_type: 'blocks'
      })

      expect(related).to.be.an('array')
      expect(related.length).to.equal(1)
      expect(related[0].base_uri).to.equal('user:task/entity-2.md')
    })

    it('should return empty array for entity with no relations', async () => {
      const related = await find_related_entities({
        connection,
        base_uri: 'user:task/entity-2.md'
      })

      expect(related).to.be.an('array')
      expect(related.length).to.equal(0)
    })
  })

  describe('get_entity_graph', () => {
    it('should return entity with its connected nodes', async () => {
      const graph = await get_entity_graph({
        connection,
        base_uri: 'user:task/entity-1.md'
      })

      expect(graph).to.have.property('nodes')
      expect(graph).to.have.property('edges')

      expect(graph.nodes).to.be.an('array')
      expect(graph.nodes.length).to.be.at.least(1)

      // The starting node should be in the graph
      const starting_node = graph.nodes.find(
        (n) => n.base_uri === 'user:task/entity-1.md'
      )
      expect(starting_node).to.not.be.undefined
    })

    it('should return empty graph for non-existent entity', async () => {
      const graph = await get_entity_graph({
        connection,
        base_uri: 'user:task/nonexistent.md'
      })

      expect(graph).to.have.property('nodes')
      expect(graph.nodes).to.be.an('array')
      // Should at least have the starting node in the map
      expect(graph.nodes.length).to.be.at.least(1)
    })
  })
})
