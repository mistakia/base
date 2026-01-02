/**
 * Embedded Index Manager
 *
 * Singleton that coordinates Kuzu and DuckDB databases for index operations.
 * Handles initialization, sync, rebuild, and shutdown.
 */

import debug from 'debug'

import config from '#config'
import {
  get_kuzu_connection,
  close_kuzu_connection,
  initialize_kuzu_client
} from './kuzu/kuzu-database-client.mjs'
import {
  create_kuzu_schema,
  drop_kuzu_schema
} from './kuzu/kuzu-schema-definitions.mjs'
import {
  upsert_entity_to_kuzu,
  delete_entity_from_kuzu,
  sync_entity_tags_to_kuzu,
  sync_entity_relations_to_kuzu
} from './kuzu/kuzu-entity-sync.mjs'
import {
  get_duckdb_connection,
  close_duckdb_connection,
  initialize_duckdb_client
} from './duckdb/duckdb-database-client.mjs'
import {
  create_duckdb_schema,
  drop_duckdb_schema
} from './duckdb/duckdb-schema-definitions.mjs'
import {
  upsert_task_to_duckdb,
  upsert_thread_to_duckdb,
  delete_task_from_duckdb,
  delete_thread_from_duckdb,
  sync_entity_tags_to_duckdb,
  sync_entity_relations_to_duckdb
} from './duckdb/duckdb-entity-sync.mjs'
import {
  extract_task_index_data,
  extract_entity_index_data,
  extract_tags_from_entity,
  extract_relations_from_entity
} from './sync/entity-data-extractor.mjs'
import { extract_thread_index_data } from './sync/thread-data-extractor.mjs'

const log = debug('embedded-index')

class EmbeddedIndexManager {
  constructor() {
    this.initialized = false
    this.kuzu_ready = false
    this.duckdb_ready = false
    this.index_config = null
  }

  _get_index_config() {
    if (this.index_config) {
      return this.index_config
    }

    const user_base_directory = config.user_base_directory
    const embedded_config = config.embedded_database_index || {}

    this.index_config = {
      enabled: embedded_config.enabled !== false,
      kuzu_directory:
        embedded_config.kuzu_directory ||
        `${user_base_directory}/embedded-database-index/kuzu`,
      duckdb_path:
        embedded_config.duckdb_path ||
        `${user_base_directory}/embedded-database-index/duckdb.db`,
      rebuild_on_startup: embedded_config.rebuild_on_startup || false,
      file_watcher_enabled: embedded_config.file_watcher_enabled !== false
    }

    return this.index_config
  }

  async initialize() {
    if (this.initialized) {
      log('Index manager already initialized')
      return
    }

    const index_config = this._get_index_config()

    if (!index_config.enabled) {
      log('Embedded database index is disabled')
      return
    }

    log('Initializing embedded index manager')

    try {
      await this._initialize_kuzu(index_config)
      this.kuzu_ready = true
      log('Kuzu database initialized')
    } catch (error) {
      log('Failed to initialize Kuzu: %s', error.message)
      this.kuzu_ready = false
    }

    try {
      await this._initialize_duckdb(index_config)
      this.duckdb_ready = true
      log('DuckDB database initialized')
    } catch (error) {
      log('Failed to initialize DuckDB: %s', error.message)
      this.duckdb_ready = false
    }

    this.initialized = true

    if (index_config.rebuild_on_startup) {
      log('Rebuild on startup enabled, rebuilding index')
      await this.rebuild_full_index()
    }

    log(
      'Embedded index manager initialized (kuzu: %s, duckdb: %s)',
      this.kuzu_ready,
      this.duckdb_ready
    )
  }

  async _initialize_kuzu(index_config) {
    await initialize_kuzu_client({ database_path: index_config.kuzu_directory })
    const kuzu_connection = await get_kuzu_connection()
    await create_kuzu_schema({ connection: kuzu_connection })
  }

  async _initialize_duckdb(index_config) {
    await initialize_duckdb_client({ database_path: index_config.duckdb_path })
    const duckdb_connection = await get_duckdb_connection()
    await create_duckdb_schema({ connection: duckdb_connection })
  }

  async rebuild_full_index() {
    log('Rebuilding full index from filesystem')

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await drop_kuzu_schema({ connection: kuzu_connection })
        await create_kuzu_schema({ connection: kuzu_connection })
        log('Kuzu schema rebuilt')
      } catch (error) {
        log('Error rebuilding Kuzu schema: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        const duckdb_connection = await get_duckdb_connection()
        await drop_duckdb_schema({ connection: duckdb_connection })
        await create_duckdb_schema({ connection: duckdb_connection })
        log('DuckDB schema rebuilt')
      } catch (error) {
        log('Error rebuilding DuckDB schema: %s', error.message)
      }
    }

    // Note: Full entity/thread scanning would be triggered by the caller
    // This method just resets the schema; actual data population is separate
    log('Index schemas reset, ready for data population')
  }

  async sync_entity({ base_uri, entity_data }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping entity sync')
      return
    }

    const entity_index_data = extract_entity_index_data({
      entity_properties: entity_data
    })
    const tag_base_uris = extract_tags_from_entity({
      entity_properties: entity_data
    })
    const relations = extract_relations_from_entity({
      entity_properties: entity_data
    })

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await upsert_entity_to_kuzu({
          connection: kuzu_connection,
          entity_data: entity_index_data
        })
        await sync_entity_tags_to_kuzu({
          connection: kuzu_connection,
          entity_base_uri: base_uri,
          tag_base_uris
        })
        await sync_entity_relations_to_kuzu({
          connection: kuzu_connection,
          entity_base_uri: base_uri,
          relations
        })
      } catch (error) {
        log('Error syncing entity to Kuzu: %s', error.message)
      }
    }

    if (this.duckdb_ready && entity_data.type === 'task') {
      try {
        const duckdb_connection = await get_duckdb_connection()
        const task_index_data = extract_task_index_data({
          entity_properties: entity_data
        })
        await upsert_task_to_duckdb({
          connection: duckdb_connection,
          task_data: task_index_data
        })
        await sync_entity_tags_to_duckdb({
          connection: duckdb_connection,
          entity_base_uri: base_uri,
          tag_base_uris
        })
        await sync_entity_relations_to_duckdb({
          connection: duckdb_connection,
          source_base_uri: base_uri,
          relations
        })
      } catch (error) {
        log('Error syncing task to DuckDB: %s', error.message)
      }
    }
  }

  async remove_entity({ base_uri }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping entity removal')
      return
    }

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await delete_entity_from_kuzu({ connection: kuzu_connection, base_uri })
      } catch (error) {
        log('Error removing entity from Kuzu: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        const duckdb_connection = await get_duckdb_connection()
        await delete_task_from_duckdb({
          connection: duckdb_connection,
          base_uri
        })
      } catch (error) {
        log('Error removing entity from DuckDB: %s', error.message)
      }
    }
  }

  async sync_thread({ thread_id, metadata }) {
    if (!this.initialized || !this.duckdb_ready) {
      log('Index manager not ready, skipping thread sync')
      return
    }

    try {
      const duckdb_connection = await get_duckdb_connection()
      const thread_index_data = extract_thread_index_data({
        thread_id,
        metadata
      })
      await upsert_thread_to_duckdb({
        connection: duckdb_connection,
        thread_data: thread_index_data
      })
    } catch (error) {
      log('Error syncing thread to DuckDB: %s', error.message)
    }
  }

  async remove_thread({ thread_id }) {
    if (!this.initialized || !this.duckdb_ready) {
      log('Index manager not ready, skipping thread removal')
      return
    }

    try {
      const duckdb_connection = await get_duckdb_connection()
      await delete_thread_from_duckdb({
        connection: duckdb_connection,
        thread_id
      })
    } catch (error) {
      log('Error removing thread from DuckDB: %s', error.message)
    }
  }

  get_index_status() {
    return {
      initialized: this.initialized,
      kuzu_ready: this.kuzu_ready,
      duckdb_ready: this.duckdb_ready,
      config: this.index_config
    }
  }

  is_ready() {
    return this.initialized && (this.kuzu_ready || this.duckdb_ready)
  }

  is_kuzu_ready() {
    return this.initialized && this.kuzu_ready
  }

  is_duckdb_ready() {
    return this.initialized && this.duckdb_ready
  }

  async shutdown() {
    log('Shutting down embedded index manager')

    if (this.kuzu_ready) {
      try {
        await close_kuzu_connection()
        log('Kuzu connection closed')
      } catch (error) {
        log('Error closing Kuzu connection: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        await close_duckdb_connection()
        log('DuckDB connection closed')
      } catch (error) {
        log('Error closing DuckDB connection: %s', error.message)
      }
    }

    this.initialized = false
    this.kuzu_ready = false
    this.duckdb_ready = false
    log('Embedded index manager shut down')
  }
}

const embedded_index_manager = new EmbeddedIndexManager()

export default embedded_index_manager
export { EmbeddedIndexManager }
