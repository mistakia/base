/**
 * Human-in-the-Loop Agent System
 * Main entry point
 */

import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// Import core components
import { initialize_mcp } from './libs-server/mcp_handler/protocol.mjs'
import { initialize_agent_system } from './libs-server/agents/agent_manager.mjs'
import { initialize_vcs } from './libs-server/vcs/git_manager.mjs'
import { initialize_data_system } from './libs-server/data/data_manager.mjs'
import { initialize_activity_system } from './libs-server/activities/activity_registry.mjs'
import { initialize_task_system } from './libs-server/tasks/task_manager.mjs'
import { initialize_human_interaction } from './libs-server/human_interaction/interaction_manager.mjs'
import { initialize_inference_system } from './libs-server/inference/inference_manager.mjs'

// Import configuration and logger
import { get_config } from './config.mjs'
import default_logger, { create_logger } from './libs-server/utils/logger.mjs'

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize with default logger until config is loaded
let logger = default_logger

/**
 * Initialize the system
 */
async function initialize_system() {
  logger.info('Initializing Human-in-the-Loop Agent System...')
  
  try {
    // Load configuration
    const config = get_config()
    logger.info(`Loaded configuration for environment: ${config.environment.node_env}`)
    
    // Create configured logger
    logger = create_logger(config)
    
    // Create data directories if they don't exist
    ensure_directories(config)
    
    // Initialize core components
    await initialize_vcs(config.git)
    await initialize_data_system(config.data)
    await initialize_activity_system(config.app)
    await initialize_task_system(config.tasks)
    await initialize_human_interaction(config.api)
    await initialize_inference_system(config.secure?.api_keys)
    await initialize_mcp(config.server)
    await initialize_agent_system(config.app)
    
    logger.info('System initialization complete')
    
    // Start the system
    start_system(config)
  } catch (error) {
    logger.error('Error during system initialization:', { error: error.message, stack: error.stack })
    process.exit(1)
  }
}

/**
 * Ensure required directories exist
 * @param {Object} config - System configuration
 */
function ensure_directories(config) {
  const data_dir = config.data?.directory || 'data'
  
  // Create main data directory
  const main_data_dir = path.join(__dirname, data_dir)
  if (!fs.existsSync(main_data_dir)) {
    logger.info(`Creating main data directory: ${main_data_dir}`)
    fs.mkdirSync(main_data_dir, { recursive: true })
  }
  
  // Create subdirectories based on configuration
  const subdirs = config.data?.subdirectories || {
    activities: 'activities',
    knowledge: 'knowledge',
    logs: 'logs',
    temp: 'temp',
    uploads: 'uploads'
  }
  
  Object.values(subdirs).forEach(subdir => {
    const dir_path = path.join(main_data_dir, subdir)
    if (!fs.existsSync(dir_path)) {
      logger.info(`Creating directory: ${dir_path}`)
      fs.mkdirSync(dir_path, { recursive: true })
    }
  })
  
  // Create additional system directories if needed
  const system_dirs = [
    path.join(main_data_dir, 'git'),
    path.join(main_data_dir, 'models'),
    path.join(main_data_dir, 'guidelines'),
    path.join(main_data_dir, 'tasks'),
    path.join(main_data_dir, 'inference')
  ]
  
  system_dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      logger.info(`Creating system directory: ${dir}`)
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

/**
 * Start the system
 * @param {Object} config - System configuration
 */
function start_system(config) {
  logger.info('Starting Human-in-the-Loop Agent System...')
  
  // Start scheduled tasks
  start_scheduled_tasks(config)
  
  // Start monitoring for events
  start_event_monitoring(config)
  
  logger.info('System started successfully')
}

/**
 * Start scheduled tasks
 * @param {Object} config - System configuration
 */
function start_scheduled_tasks(config) {
  logger.info('Starting scheduled tasks...')
  
  if (config.tasks?.scheduler?.enabled) {
    logger.info(`Scheduler enabled with cleanup interval: ${config.tasks.scheduler.cleanup_interval}`)
    logger.info(`Backup interval: ${config.tasks.scheduler.backup_interval}`)
    // Implementation details
  } else {
    logger.info('Task scheduler is disabled in configuration')
  }
}

/**
 * Start monitoring for events
 * @param {Object} config - System configuration
 */
function start_event_monitoring(config) {
  logger.info('Starting event monitoring...')
  
  if (config.git?.enabled && config.git?.auto_commit) {
    logger.info(`Git auto-commit enabled with interval: ${config.git.commit_interval}ms`)
    // Implementation details
  }
  
  // Additional event monitoring setup based on configuration
}

// Initialize the system when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initialize_system()
}

export {
  initialize_system,
  start_system
} 