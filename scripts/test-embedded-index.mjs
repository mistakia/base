#!/usr/bin/env node
/**
 * Test script for embedded database index
 */

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_tasks_from_entities,
  count_tasks_from_entities
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import {
  find_entities_by_tag,
  find_related_entities
} from '#libs-server/embedded-database-index/kuzu/kuzu-graph-queries.mjs'
import { get_kuzu_connection } from '#libs-server/embedded-database-index/kuzu/kuzu-database-client.mjs'

console.log('Testing embedded database index...\n')

try {
  console.log('1. Initializing index manager...')
  await embedded_index_manager.initialize()

  const status = embedded_index_manager.get_index_status()
  console.log('   Kuzu ready:', status.kuzu_ready)
  console.log('   DuckDB ready:', status.duckdb_ready)
  console.log('   Database paths:')
  console.log('     Kuzu:', status.config.kuzu_directory)
  console.log('     DuckDB:', status.config.duckdb_path)

  // Sync test data
  console.log('\n2. Syncing test data...')
  const test_task = {
    entity_id: 'test-task-001',
    base_uri: 'user:task/test/test-task.md',
    title: 'Test Task',
    type: 'task',
    status: 'In Progress',
    priority: 'High',
    description: 'A test task for verifying embedded index',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_public_key: 'test-user-key',
    tags: ['user:tag/base-project.md', 'user:tag/test.md'],
    relations: [
      {
        relation_type: 'relates_to',
        target_base_uri: 'user:task/related-task.md'
      }
    ]
  }

  await embedded_index_manager.sync_entity({
    base_uri: test_task.base_uri,
    entity_data: test_task
  })
  console.log('   Synced test task')

  // Sync a test thread
  const test_thread = {
    thread_id: 'test-thread-001',
    title: 'Test Thread',
    thread_state: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 10,
    user_message_count: 5,
    assistant_message_count: 5,
    total_input_tokens: 1000,
    total_output_tokens: 2000,
    user_public_key: 'test-user-key'
  }

  await embedded_index_manager.sync_thread({
    thread_id: test_thread.thread_id,
    metadata: test_thread
  })
  console.log('   Synced test thread')

  // Test DuckDB queries (via entities table)
  if (embedded_index_manager.is_duckdb_ready()) {
    console.log('\n3. Testing DuckDB queries via entities table...')

    const task_count = await count_tasks_from_entities({})
    console.log('   Task count:', task_count)

    const tasks = await query_tasks_from_entities({
      filters: [{ column_id: 'status', operator: '=', value: 'In Progress' }],
      limit: 5
    })
    console.log('   Tasks with status "In Progress":', tasks.length)
    if (tasks.length > 0) {
      console.log('   First task:', {
        title: tasks[0].title,
        status: tasks[0].status
      })
    }
  }

  // Test Kuzu queries
  if (embedded_index_manager.is_kuzu_ready()) {
    console.log('\n4. Testing Kuzu queries...')
    const kuzu_connection = await get_kuzu_connection()

    const entities = await find_entities_by_tag({
      connection: kuzu_connection,
      tag_base_uri: 'user:tag/base-project.md'
    })
    console.log('   Entities with base-project tag:', entities.length)

    const related = await find_related_entities({
      connection: kuzu_connection,
      base_uri: test_task.base_uri
    })
    console.log('   Related entities:', related.length)
  }

  // Clean up test data
  console.log('\n5. Cleaning up test data...')
  await embedded_index_manager.remove_entity({ base_uri: test_task.base_uri })
  await embedded_index_manager.remove_thread({
    thread_id: test_thread.thread_id
  })
  console.log('   Test data removed')

  console.log('\n6. Shutting down...')
  await embedded_index_manager.shutdown()
  console.log('   Done!')

  console.log('\n=== All tests passed ===')
} catch (error) {
  console.error('Error:', error.message)
  console.error(error.stack)
  process.exit(1)
}
