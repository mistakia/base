import chokidar from 'chokidar'
import fs from 'fs/promises'
import debug from 'debug'

/**
 * Generic file-based queue processor
 *
 * Watches a queue file for items to process and runs a configurable
 * processing function on each item.
 */
export class FileBasedQueueProcessor {
  /**
   * Create a new queue processor
   *
   * @param {Object} config - Configuration options
   * @param {string} config.name - Processor name for logging
   * @param {string} config.debug_namespace - Debug namespace (e.g., 'metadata:queue')
   * @param {string} config.queue_file_path - Path to the queue file
   * @param {string} config.processed_file_path - Path to the processed log file
   * @param {Function} config.process_item - Async function to process each item
   * @param {Function} [config.format_log_details] - Optional function to format details for processed log
   * @param {number} [config.stability_threshold_ms=1000] - File stability threshold
   * @param {number} [config.poll_interval_ms=100] - Poll interval for file watcher
   * @param {number} [config.process_delay_ms=2000] - Delay before processing to batch entries
   * @param {number} [config.item_delay_ms=500] - Delay between processing items
   */
  constructor(config) {
    this.name = config.name
    this.log = debug(config.debug_namespace)
    this.queue_file_path = config.queue_file_path
    this.processed_file_path = config.processed_file_path
    this.process_item = config.process_item
    this.format_log_details = config.format_log_details || (() => '')

    this.stability_threshold_ms = config.stability_threshold_ms || 1000
    this.poll_interval_ms = config.poll_interval_ms || 100
    this.process_delay_ms = config.process_delay_ms || 2000
    this.item_delay_ms = config.item_delay_ms || 500

    this.watcher = null
    this.process_timeout = null
    this.is_processing = false
  }

  /**
   * Read items from the queue file
   * @returns {Promise<string[]>} Array of items
   */
  async read_queue_file() {
    try {
      const content = await fs.readFile(this.queue_file_path, 'utf-8')
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      // Deduplicate
      return [...new Set(lines)]
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      this.log(`Failed to read queue file: ${error.message}`)
      throw error
    }
  }

  /**
   * Write items back to the queue file
   * @param {string[]} items - Items to write
   */
  async write_queue_file(items) {
    const content = items.join('\n') + (items.length > 0 ? '\n' : '')
    await fs.writeFile(this.queue_file_path, content, 'utf-8')
  }

  /**
   * Remove an item from the queue
   * @param {string} item - Item to remove
   */
  async remove_from_queue(item) {
    const queue = await this.read_queue_file()
    const updated = queue.filter((id) => id !== item)
    await this.write_queue_file(updated)
    this.log(`Removed ${item} from queue`)
  }

  /**
   * Log a processed item
   * @param {string} item - Item that was processed
   * @param {string} status - Processing status
   * @param {Object} [result] - Processing result for details
   */
  async log_processed(item, status, result = {}) {
    const timestamp = new Date().toISOString()
    const details = this.format_log_details(result)
    const details_str = details ? `\t${details}` : ''
    const entry = `${timestamp}\t${item}\t${status}${details_str}\n`

    try {
      await fs.appendFile(this.processed_file_path, entry, 'utf-8')
    } catch (error) {
      this.log(`Failed to log processed item: ${error.message}`)
    }
  }

  /**
   * Process all items in the queue
   */
  async process_queue() {
    if (this.is_processing) {
      this.log('Already processing, skipping')
      return
    }

    this.is_processing = true

    try {
      const queue = await this.read_queue_file()

      if (queue.length === 0) {
        this.log('Queue is empty')
        return
      }

      this.log(`Processing ${queue.length} items from queue`)

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]
        let result

        try {
          result = await this.process_item(item)
          this.log(`Item ${item} result: ${result?.status || 'unknown'}`)
        } catch (error) {
          this.log(`Error processing item ${item}: ${error.message}`)
          result = {
            item,
            status: 'error',
            error: error.message
          }
        }

        // Log the result
        await this.log_processed(item, result?.status || 'unknown', result)

        // Brief delay between processing items
        if (i < queue.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.item_delay_ms)
          )
        }
      }

      // Clear the queue in a single write operation after all items are processed
      await this.write_queue_file([])

      this.log('Queue processing complete')
    } catch (error) {
      this.log(`Queue processing failed: ${error.message}`)
    } finally {
      this.is_processing = false
    }
  }

  /**
   * Schedule queue processing with debounce
   */
  schedule_processing() {
    if (this.process_timeout) {
      clearTimeout(this.process_timeout)
    }

    this.process_timeout = setTimeout(() => {
      this.process_queue()
    }, this.process_delay_ms)
  }

  /**
   * Handle queue file changes
   * @param {string} event_type - Chokidar event type
   * @param {string} file_path - Path to the changed file
   */
  handle_queue_file_change(event_type, file_path) {
    this.log(`Queue file ${event_type}: ${file_path}`)
    this.schedule_processing()
  }

  /**
   * Create watcher configuration
   * @returns {Object} Chokidar configuration
   */
  create_watcher_config() {
    return {
      awaitWriteFinish: {
        stabilityThreshold: this.stability_threshold_ms,
        pollInterval: this.poll_interval_ms
      },
      persistent: true,
      ignoreInitial: false,
      // Use polling on macOS because /tmp -> /private/tmp symlink breaks FSEvents
      usePolling: process.platform === 'darwin',
      interval: 500
    }
  }

  /**
   * Start the queue processor
   * @returns {Object} Watcher instance
   */
  start() {
    if (this.watcher) {
      this.log(`${this.name} already running`)
      return this.watcher
    }

    this.log(`Starting ${this.name}`)
    this.log(`Watching: ${this.queue_file_path}`)

    try {
      const config = this.create_watcher_config()
      this.watcher = chokidar.watch(this.queue_file_path, config)

      this.watcher.on('add', (path) =>
        this.handle_queue_file_change('add', path)
      )
      this.watcher.on('change', (path) =>
        this.handle_queue_file_change('change', path)
      )
      this.watcher.on('error', (error) => {
        this.log('Queue watcher error:', error)
      })
      this.watcher.on('ready', () => {
        this.log(`${this.name} ready`)
        // Process any existing queue entries on startup
        this.schedule_processing()
      })

      return this.watcher
    } catch (error) {
      this.log(`Failed to start ${this.name}:`, error)
      throw error
    }
  }

  /**
   * Stop the queue processor
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.watcher) {
      this.log(`No ${this.name} to stop`)
      return
    }

    this.log(`Stopping ${this.name}`)

    if (this.process_timeout) {
      clearTimeout(this.process_timeout)
      this.process_timeout = null
    }

    try {
      await this.watcher.close()
      this.watcher = null
      this.log(`${this.name} stopped`)
    } catch (error) {
      this.log(`Error stopping ${this.name}:`, error)
      throw error
    }
  }
}

/**
 * Helper to detect if running as main module (direct execution or PM2)
 * @param {string} filename - The processor filename (e.g., 'metadata-queue-processor.mjs')
 * @param {string} pm2_name - The PM2 process name
 * @returns {boolean}
 */
export const is_standalone_execution = (filename, pm2_name) => {
  const is_direct = process.argv[1]?.endsWith(filename)
  const is_pm2 =
    process.env.pm_id !== undefined && process.env.name === pm2_name
  return is_direct || is_pm2
}
