/**
 * Permission Module - Public API
 *
 * This module provides a unified permission system with request-scoped caching
 * and a common interface for all resource types (threads, entities, files).
 *
 * Key Components:
 * - PermissionContext: Request-scoped caching for permission data
 * - Permission Service: Main API functions for permission checking
 * - Middleware: Express middleware for route-level permission checks
 * - Resource Metadata: Unified metadata loading for all resource types
 */

// Permission Context - for advanced use cases requiring manual context management
export { PermissionContext } from './permission-context.mjs'

// Permission Service - main API functions
export {
  check_permission,
  check_thread_permission,
  check_thread_permission_for_user,
  check_permissions_batch,
  validate_thread_ownership,
  check_user_permission,
  check_user_permission_for_file,
  check_create_threads_permission
} from './permission-service.mjs'

// Resource Metadata - for direct metadata access
export {
  load_resource_metadata,
  load_thread_metadata,
  load_entity_metadata,
  map_thread_id_to_base_uri
} from './resource-metadata.mjs'

// Middleware - Express middleware functions
export {
  attach_permission_context,
  check_thread_permission_middleware,
  check_filesystem_permission
} from './middleware.mjs'
