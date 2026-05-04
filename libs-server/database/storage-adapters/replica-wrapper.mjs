/**
 * Replica Wrapper Adapter
 *
 * Composes a local adapter (pointed at a rsync-mirrored read-only replica file)
 * with a remote adapter (pointed at the canonical file on the writer host).
 *
 * Reads (query, count) hit the local replica at native disk speed.
 *
 * Writes (insert, update, delete) and schema operations (create_table) go through
 * the remote adapter, then the local replica file is removed so the next read
 * either picks up a freshly rsynced copy or transparently falls through to the
 * remote adapter via the factory's existing logic.
 *
 * Intended for the read-through-replica pattern documented in
 * sys:system/schema/database.md (storage_config.replica_path).
 */

import debug from 'debug'
import fs from 'fs'

const log = debug('database:adapter:replica')

export function create_replica_adapter({
  local_adapter,
  remote_adapter,
  replica_full_path
}) {
  async function invalidate_replica() {
    try {
      // Close the local adapter's file handle before unlinking so the next
      // factory call doesn't reopen a deleted inode.
      await local_adapter.close()
    } catch (err) {
      log('local adapter close error during invalidation: %s', err.message)
    }
    try {
      await fs.promises.unlink(replica_full_path)
      log('invalidated replica at %s', replica_full_path)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log('replica unlink failed: %s', err.message)
        throw err
      }
    }
  }

  return {
    async create_table() {
      const result = await remote_adapter.create_table()
      await invalidate_replica()
      return result
    },

    async insert(records) {
      const result = await remote_adapter.insert(records)
      await invalidate_replica()
      return result
    },

    async update(id, fields) {
      const result = await remote_adapter.update(id, fields)
      await invalidate_replica()
      return result
    },

    async delete(id) {
      const result = await remote_adapter.delete(id)
      await invalidate_replica()
      return result
    },

    async query(opts) {
      return local_adapter.query(opts)
    },

    async count(filter) {
      return local_adapter.count(filter)
    },

    async close() {
      await Promise.allSettled([local_adapter.close(), remote_adapter.close()])
    }
  }
}

export default { create_replica_adapter }
