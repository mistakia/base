/**
 * @fileoverview Integration tests for entity tree command filter enhancements
 *
 * Tests the --relation-type, --status, and --project flags for
 * `base entity tree` command using in-memory DuckDB.
 */

import { expect } from 'chai'

import {
  initialize_duckdb_client,
  close_duckdb_connection
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { create_duckdb_schema } from '#libs-server/embedded-database-index/duckdb/duckdb-schema-definitions.mjs'
import {
  upsert_entity_to_duckdb,
  sync_entity_relations_to_duckdb,
  sync_entity_tags_to_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-entity-sync.mjs'
import { find_related_entities } from '#libs-server/embedded-database-index/duckdb/duckdb-relation-queries.mjs'

describe('Entity Tree Filter Integration', function () {
  this.timeout(10000)

  const test_entities = [
    {
      entity_id: 'tree-task-1',
      base_uri: 'user:task/tree-root.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-1',
        base_uri: 'user:task/tree-root.md',
        type: 'task',
        title: 'Root Task',
        status: 'In Progress',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    },
    {
      entity_id: 'tree-task-2',
      base_uri: 'user:task/blocker.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-2',
        base_uri: 'user:task/blocker.md',
        type: 'task',
        title: 'Blocker Task',
        status: 'Planned',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    },
    {
      entity_id: 'tree-task-3',
      base_uri: 'user:task/subtask.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-3',
        base_uri: 'user:task/subtask.md',
        type: 'task',
        title: 'Subtask',
        status: 'Completed',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    },
    {
      entity_id: 'tree-task-4',
      base_uri: 'user:task/successor.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-4',
        base_uri: 'user:task/successor.md',
        type: 'task',
        title: 'Successor Task',
        status: 'In Progress',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    },
    {
      entity_id: 'tree-task-5',
      base_uri: 'user:task/deep-child.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-5',
        base_uri: 'user:task/deep-child.md',
        type: 'task',
        title: 'Deep Child',
        status: 'In Progress',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    },
    {
      entity_id: 'tree-task-6',
      base_uri: 'user:task/project-only.md',
      type: 'task',
      frontmatter: {
        entity_id: 'tree-task-6',
        base_uri: 'user:task/project-only.md',
        type: 'task',
        title: 'Project Only Task',
        status: 'Planned',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_public_key: 'test-user'
      },
      user_public_key: 'test-user'
    }
  ]

  // Relations:
  // root --blocked_by--> blocker
  // root --has_subtask--> subtask
  // root --precedes--> successor
  // subtask --has_subtask--> deep-child (deep child is "In Progress")

  before(async () => {
    await close_duckdb_connection()
    await initialize_duckdb_client({ in_memory: true })
    await create_duckdb_schema()

    for (const entity of test_entities) {
      await upsert_entity_to_duckdb({ entity_data: entity })
    }

    // root -> blocker (blocked_by)
    await sync_entity_relations_to_duckdb({
      source_base_uri: 'user:task/tree-root.md',
      relations: [
        {
          target_base_uri: 'user:task/blocker.md',
          relation_type: 'blocked_by'
        },
        {
          target_base_uri: 'user:task/subtask.md',
          relation_type: 'has_subtask'
        },
        {
          target_base_uri: 'user:task/successor.md',
          relation_type: 'precedes'
        }
      ]
    })

    // subtask -> deep-child (has_subtask)
    await sync_entity_relations_to_duckdb({
      source_base_uri: 'user:task/subtask.md',
      relations: [
        {
          target_base_uri: 'user:task/deep-child.md',
          relation_type: 'has_subtask'
        }
      ]
    })

    // project-only -> blocker (blocked_by)
    await sync_entity_relations_to_duckdb({
      source_base_uri: 'user:task/project-only.md',
      relations: [
        {
          target_base_uri: 'user:task/blocker.md',
          relation_type: 'blocked_by'
        }
      ]
    })

    // Tag root and project-only with the same project tag
    await sync_entity_tags_to_duckdb({
      entity_base_uri: 'user:task/tree-root.md',
      tag_base_uris: ['user:tag/test-project.md']
    })
    await sync_entity_tags_to_duckdb({
      entity_base_uri: 'user:task/project-only.md',
      tag_base_uris: ['user:tag/test-project.md']
    })
  })

  after(async () => {
    try {
      await close_duckdb_connection()
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('--relation-type filter', () => {
    it('should return only matching relation types from forward relations', async () => {
      const forward = await find_related_entities({
        base_uri: 'user:task/tree-root.md',
        limit: 100,
        offset: 0
      })

      const blocked_only = forward.filter((r) =>
        ['blocked_by'].includes(r.relation_type)
      )
      const all_dep = forward.filter((r) =>
        ['blocked_by', 'has_subtask', 'precedes'].includes(r.relation_type)
      )

      expect(blocked_only).to.have.lengthOf(1)
      expect(blocked_only[0].base_uri).to.equal('user:task/blocker.md')
      expect(all_dep).to.have.lengthOf(3)
    })

    it('should filter to a single relation type', async () => {
      const forward = await find_related_entities({
        base_uri: 'user:task/tree-root.md',
        relation_type: 'has_subtask',
        limit: 100,
        offset: 0
      })

      expect(forward).to.have.lengthOf(1)
      expect(forward[0].base_uri).to.equal('user:task/subtask.md')
    })

    it('should return empty when filtering for non-existent relation type', async () => {
      const forward = await find_related_entities({
        base_uri: 'user:task/tree-root.md',
        relation_type: 'assigned_to',
        limit: 100,
        offset: 0
      })

      expect(forward).to.be.an('array').that.is.empty
    })
  })

  describe('--status filter (prune_tree logic)', () => {
    // Simulate the prune_tree function used in handle_tree
    const prune_tree = (node, status_filter) => {
      if (!status_filter) return node
      const pruned_children = []
      for (const child of node.children) {
        const pruned_child = prune_tree(child, status_filter)
        const status_matches =
          child.status &&
          status_filter.includes(child.status.toLowerCase())
        if (status_matches || pruned_child.children.length > 0) {
          pruned_children.push({ ...child, children: pruned_child.children })
        }
      }
      return { ...node, children: pruned_children }
    }

    it('should filter nodes by status', () => {
      const tree = {
        base_uri: 'user:task/tree-root.md',
        children: [
          {
            base_uri: 'user:task/blocker.md',
            status: 'Planned',
            children: []
          },
          {
            base_uri: 'user:task/subtask.md',
            status: 'Completed',
            children: []
          },
          {
            base_uri: 'user:task/successor.md',
            status: 'In Progress',
            children: []
          }
        ]
      }

      const pruned = prune_tree(tree, ['in progress'])
      expect(pruned.children).to.have.lengthOf(1)
      expect(pruned.children[0].base_uri).to.equal('user:task/successor.md')
    })

    it('should accept multiple status values', () => {
      const tree = {
        base_uri: 'user:task/tree-root.md',
        children: [
          {
            base_uri: 'user:task/blocker.md',
            status: 'Planned',
            children: []
          },
          {
            base_uri: 'user:task/subtask.md',
            status: 'Completed',
            children: []
          },
          {
            base_uri: 'user:task/successor.md',
            status: 'In Progress',
            children: []
          }
        ]
      }

      const pruned = prune_tree(tree, ['in progress', 'planned'])
      expect(pruned.children).to.have.lengthOf(2)
      const uris = pruned.children.map((c) => c.base_uri)
      expect(uris).to.include('user:task/blocker.md')
      expect(uris).to.include('user:task/successor.md')
    })

    it('should preserve intermediate nodes connecting to matching descendants', () => {
      // subtask is "Completed" but its child deep-child is "In Progress"
      const tree = {
        base_uri: 'user:task/tree-root.md',
        children: [
          {
            base_uri: 'user:task/subtask.md',
            status: 'Completed',
            children: [
              {
                base_uri: 'user:task/deep-child.md',
                status: 'In Progress',
                children: []
              }
            ]
          },
          {
            base_uri: 'user:task/blocker.md',
            status: 'Planned',
            children: []
          }
        ]
      }

      const pruned = prune_tree(tree, ['in progress'])
      // subtask should be kept because deep-child matches
      expect(pruned.children).to.have.lengthOf(1)
      expect(pruned.children[0].base_uri).to.equal('user:task/subtask.md')
      expect(pruned.children[0].children).to.have.lengthOf(1)
      expect(pruned.children[0].children[0].base_uri).to.equal(
        'user:task/deep-child.md'
      )
    })

    it('should return no children when no status matches', () => {
      const tree = {
        base_uri: 'user:task/tree-root.md',
        children: [
          {
            base_uri: 'user:task/blocker.md',
            status: 'Planned',
            children: []
          }
        ]
      }

      const pruned = prune_tree(tree, ['abandoned'])
      expect(pruned.children).to.be.empty
    })

    it('should be case-insensitive', () => {
      const tree = {
        base_uri: 'user:task/tree-root.md',
        children: [
          {
            base_uri: 'user:task/successor.md',
            status: 'In Progress',
            children: []
          }
        ]
      }

      const pruned = prune_tree(tree, ['IN PROGRESS'.toLowerCase()])
      expect(pruned.children).to.have.lengthOf(1)
    })
  })

  describe('--project mode (entity_tags query)', () => {
    it('should find entities by tag', async () => {
      const { execute_duckdb_query } =
        await import(
          '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
        )
      const result = await execute_duckdb_query({
        query:
          'SELECT entity_base_uri FROM entity_tags WHERE tag_base_uri = ? ORDER BY entity_base_uri',
        parameters: ['user:tag/test-project.md']
      })

      expect(result).to.have.lengthOf(2)
      const uris = result.map((r) => r.entity_base_uri)
      expect(uris).to.include('user:task/tree-root.md')
      expect(uris).to.include('user:task/project-only.md')
    })

    it('should return empty for non-existent tag', async () => {
      const { execute_duckdb_query } =
        await import(
          '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
        )
      const result = await execute_duckdb_query({
        query:
          'SELECT entity_base_uri FROM entity_tags WHERE tag_base_uri = ?',
        parameters: ['user:tag/nonexistent.md']
      })

      expect(result).to.be.an('array').that.is.empty
    })

    it('should deduplicate nodes via shared visited set across multiple trees', async () => {
      // Simulate the project mode deduplication logic with a shared visited set
      const visited = new Set()

      // First tree traversal marks root and its children as visited
      const root_forward = await find_related_entities({
        base_uri: 'user:task/tree-root.md',
        limit: 100,
        offset: 0
      })
      visited.add('user:task/tree-root.md')
      for (const rel of root_forward) {
        visited.add(rel.base_uri)
      }

      // Verify blocker is now visited
      expect(visited.has('user:task/blocker.md')).to.be.true

      // Second tree (project-only) references blocker too
      const project_forward = await find_related_entities({
        base_uri: 'user:task/project-only.md',
        limit: 100,
        offset: 0
      })
      expect(project_forward).to.have.lengthOf(1)
      expect(project_forward[0].base_uri).to.equal('user:task/blocker.md')

      // Blocker is already visited so would return null in build_tree
      expect(visited.has(project_forward[0].base_uri)).to.be.true
    })
  })
})
