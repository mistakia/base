import debug from 'debug'

const log = debug('threads:timeline-filter-utils')

/**
 * Validate timeline filter parameters for conflicts
 * @param {Object} params - Filter parameters
 * @returns {Object} Validation result with success boolean and error message if failed
 */
export function validate_filter_parameters(params) {
  const {
    limit,
    offset,
    take_first,
    take_last,
    skip_first,
    skip_last,
    start_index,
    end_index
  } = params

  // Define the three mutually exclusive parameter groups
  const pagination_params = [limit, offset].filter(p => p !== undefined)
  const position_params = [take_first, take_last, skip_first, skip_last].filter(p => p !== undefined)
  const index_params = [start_index, end_index].filter(p => p !== undefined)

  const active_groups = [
    { name: 'pagination', count: pagination_params.length },
    { name: 'position-based', count: position_params.length },
    { name: 'index-based', count: index_params.length }
  ].filter(group => group.count > 0)

  // Check if more than one group is used
  if (active_groups.length > 1) {
    const group_names = active_groups.map(g => g.name).join(', ')
    return {
      success: false,
      error: `Conflicting slice parameters: cannot use ${group_names} slicing methods simultaneously. Choose one approach.`
    }
  }

  // Validate pagination parameters
  if (pagination_params.length > 0) {
    if (offset !== undefined && limit === undefined) {
      return {
        success: false,
        error: 'offset parameter requires limit parameter to be specified'
      }
    }
    if (limit !== undefined && (limit <= 0 || !Number.isInteger(limit))) {
      return {
        success: false,
        error: 'limit parameter must be a positive integer'
      }
    }
    if (offset !== undefined && (offset < 0 || !Number.isInteger(offset))) {
      return {
        success: false,
        error: 'offset parameter must be a non-negative integer'
      }
    }
  }

  // Validate position-based parameters
  const position_param_names = ['take_first', 'take_last', 'skip_first', 'skip_last']
  for (const param_name of position_param_names) {
    const value = params[param_name]
    if (value !== undefined && (value <= 0 || !Number.isInteger(value))) {
      return {
        success: false,
        error: `${param_name} parameter must be a positive integer`
      }
    }
  }

  // Validate index-based parameters
  if (start_index !== undefined && (start_index < 0 || !Number.isInteger(start_index))) {
    return {
      success: false,
      error: 'start_index parameter must be a non-negative integer'
    }
  }
  if (end_index !== undefined && (end_index < 0 || !Number.isInteger(end_index))) {
    return {
      success: false,
      error: 'end_index parameter must be a non-negative integer'
    }
  }
  if (start_index !== undefined && end_index !== undefined && start_index >= end_index) {
    return {
      success: false,
      error: 'start_index must be less than end_index'
    }
  }

  return { success: true }
}

/**
 * Check if a timeline entry passes the specified filters
 * @param {Object} entry - Timeline entry to check
 * @param {Object} filters - Filter criteria
 * @returns {boolean} True if entry passes all filters
 */
export function passes_timeline_filters(entry, filters) {
  const {
    include_types = [],
    exclude_types = [],
    include_roles = [],
    exclude_roles = [],
    include_tool_names = [],
    exclude_tool_names = [],
    include_sidechain = true
  } = filters

  // Filter by sidechain
  if (!include_sidechain && entry.sidechain) {
    return false
  }

  // Filter by entry type (AND logic for include/exclude)
  if (include_types.length > 0 && !include_types.includes(entry.type)) {
    return false
  }
  if (exclude_types.length > 0 && exclude_types.includes(entry.type)) {
    return false
  }

  // Filter by message role (AND logic for include/exclude)
  if (entry.type === 'message' && entry.data?.role) {
    if (include_roles.length > 0 && !include_roles.includes(entry.data.role)) {
      return false
    }
    if (exclude_roles.length > 0 && exclude_roles.includes(entry.data.role)) {
      return false
    }
  }

  // Filter by tool name (AND logic for include/exclude)
  if (entry.type === 'tool_call' && entry.data?.tool_name) {
    if (include_tool_names.length > 0 && !include_tool_names.includes(entry.data.tool_name)) {
      return false
    }
    if (exclude_tool_names.length > 0 && exclude_tool_names.includes(entry.data.tool_name)) {
      return false
    }
  }

  return true
}

/**
 * Apply content filtering to timeline entries
 * @param {Array} timeline - Timeline entries to filter
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered timeline entries
 */
export function apply_timeline_filters(timeline, filters) {
  log(`Applying timeline filters: ${JSON.stringify(filters)}`)

  return timeline.filter(entry => passes_timeline_filters(entry, filters))
}

/**
 * Apply slicing to timeline entries based on the specified parameters
 * @param {Array} timeline - Timeline entries to slice
 * @param {Object} slice_params - Slicing parameters
 * @returns {Array} Sliced timeline entries
 */
export function apply_timeline_slicing(timeline, slice_params) {
  const {
    limit,
    offset,
    take_first,
    take_last,
    skip_first,
    skip_last,
    start_index,
    end_index
  } = slice_params

  log(`Applying timeline slicing: ${JSON.stringify(slice_params)}`)

  // No slicing parameters provided
  if (!limit && !take_first && !take_last && !skip_first && !skip_last && start_index === undefined && end_index === undefined) {
    return timeline
  }

  // Pagination slicing (limit + offset)
  if (limit !== undefined) {
    const start = offset || 0
    return timeline.slice(start, start + limit)
  }

  // Position-based slicing
  let result = [...timeline]

  if (skip_first !== undefined) {
    result = result.slice(skip_first)
  }
  if (skip_last !== undefined) {
    result = result.slice(0, -skip_last)
  }
  if (take_first !== undefined) {
    result = result.slice(0, take_first)
  }
  if (take_last !== undefined) {
    result = result.slice(-take_last)
  }

  // Index-based slicing
  if (start_index !== undefined || end_index !== undefined) {
    const start = start_index || 0
    const end = end_index !== undefined ? end_index : timeline.length
    result = timeline.slice(start, end)
  }

  return result
}
