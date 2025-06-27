/* global IS_DEV */

//= ====================================
//  GENERAL
// -------------------------------------
export const BASE_URL = IS_DEV
  ? 'http://localhost:8080'
  : 'https://base.tint.space'
export const API_URL = `${BASE_URL}/api`
export const WEBSOCKET_URL = IS_DEV
  ? 'ws://localhost:8080'
  : 'wss://base.tint.space'

//= ====================================
//  ROUTES
// -------------------------------------
// Reserved root-level routes that are not username-based
// These routes are reserved and cannot be used as usernames
export const RESERVED_ROOT_ROUTES = {
  AUTH: 'auth',
  TASKS: 'tasks',
  THREADS: 'threads',
  API: 'api'
}

// Array of reserved route values for easy checking
export const RESERVED_ROOT_ROUTE_PATHS = Object.values(RESERVED_ROOT_ROUTES)

// Helper function to check if a path segment is a reserved route
export const is_reserved_route = (path_segment) => {
  return RESERVED_ROOT_ROUTE_PATHS.includes(path_segment)
}

// Helper function to extract username from pathname
export const extract_username_from_path = (pathname) => {
  const path_match = pathname.match(/^\/([^/]+)/)
  const path_segment = path_match ? path_match[1] : null

  // Return null if it's a reserved route, otherwise return the segment
  return path_segment && !is_reserved_route(path_segment) ? path_segment : null
}
