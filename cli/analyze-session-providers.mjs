#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '#config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration for enum detection
const ENUM_MAX_UNIQUE_VALUES = 20

// Path to thread directory - use config to support test mode
if (!config.user_base_directory) {
  throw new Error(
    'user_base_directory not configured. Set config.user_base_directory or NODE_ENV=test for test mode.'
  )
}
const normalized_session_thread_directory = path.join(
  config.user_base_directory,
  'thread'
)

// Function to deep merge objects for session analysis
const deep_merge_session_data = (
  target_session_structure,
  source_session_structure
) => {
  const merged_session_structure = { ...target_session_structure }

  for (const session_property_key in source_session_structure) {
    if (
      source_session_structure[session_property_key] &&
      typeof source_session_structure[session_property_key] === 'object' &&
      !Array.isArray(source_session_structure[session_property_key])
    ) {
      if (target_session_structure[session_property_key]) {
        merged_session_structure[session_property_key] =
          deep_merge_session_data(
            target_session_structure[session_property_key],
            source_session_structure[session_property_key]
          )
      } else {
        merged_session_structure[session_property_key] =
          source_session_structure[session_property_key]
      }
    } else if (Array.isArray(source_session_structure[session_property_key])) {
      // For arrays, we'll collect unique items
      if (Array.isArray(target_session_structure[session_property_key])) {
        const combined_array_items = [
          ...target_session_structure[session_property_key],
          ...source_session_structure[session_property_key]
        ]
        merged_session_structure[session_property_key] = [
          ...new Set(
            combined_array_items.map((array_item) =>
              typeof array_item === 'string'
                ? array_item
                : JSON.stringify(array_item)
            )
          )
        ].map((serialized_item) => {
          try {
            return JSON.parse(serialized_item)
          } catch {
            return serialized_item
          }
        })
      } else {
        merged_session_structure[session_property_key] =
          source_session_structure[session_property_key]
      }
    } else {
      // Handle special merge cases for enhanced data
      if (
        session_property_key === 'unique_values' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        // Merge unique values arrays
        const target_values = Array.isArray(
          target_session_structure[session_property_key]
        )
          ? target_session_structure[session_property_key]
          : [target_session_structure[session_property_key]]
        const source_values = Array.isArray(
          source_session_structure[session_property_key]
        )
          ? source_session_structure[session_property_key]
          : [source_session_structure[session_property_key]]

        const all_values = [
          ...new Set([...target_values, ...source_values])
        ].sort()

        // Only keep unique_values if still under threshold
        if (all_values.length <= ENUM_MAX_UNIQUE_VALUES) {
          merged_session_structure[session_property_key] = all_values
        } else {
          // Remove unique_values if exceeded threshold
          delete merged_session_structure.unique_values
        }
      } else if (
        session_property_key === 'unique_count' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        // For unique_count, take the maximum (representing total unique values seen)
        merged_session_structure[session_property_key] = Math.max(
          target_session_structure[session_property_key],
          source_session_structure[session_property_key]
        )
      } else if (
        session_property_key === 'sample_values' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        const target_samples = Array.isArray(
          target_session_structure[session_property_key]
        )
          ? target_session_structure[session_property_key]
          : [target_session_structure[session_property_key]]
        const source_samples = Array.isArray(
          source_session_structure[session_property_key]
        )
          ? source_session_structure[session_property_key]
          : [source_session_structure[session_property_key]]

        const all_samples = [...target_samples, ...source_samples]
        const unique_samples = [
          ...new Set(all_samples.map((s) => JSON.stringify(s)))
        ]
          .map((s) => JSON.parse(s))
          .slice(0, 10) // Limit to 10 diverse samples

        merged_session_structure[session_property_key] =
          unique_samples.length === 1 ? unique_samples[0] : unique_samples
      } else if (
        session_property_key === 'frequency' &&
        target_session_structure[session_property_key]
      ) {
        merged_session_structure[session_property_key] =
          target_session_structure[session_property_key] +
          source_session_structure[session_property_key]
      } else if (
        session_property_key === 'min_length' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        merged_session_structure[session_property_key] = Math.min(
          target_session_structure[session_property_key],
          source_session_structure[session_property_key]
        )
      } else if (
        session_property_key === 'max_length' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        merged_session_structure[session_property_key] = Math.max(
          target_session_structure[session_property_key],
          source_session_structure[session_property_key]
        )
      } else if (
        session_property_key === 'min_value' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        merged_session_structure[session_property_key] = Math.min(
          target_session_structure[session_property_key],
          source_session_structure[session_property_key]
        )
      } else if (
        session_property_key === 'max_value' &&
        target_session_structure[session_property_key] !== undefined
      ) {
        merged_session_structure[session_property_key] = Math.max(
          target_session_structure[session_property_key],
          source_session_structure[session_property_key]
        )
      } else {
        merged_session_structure[session_property_key] =
          source_session_structure[session_property_key]
      }
    }
  }

  return merged_session_structure
}

// Function to analyze session data structure with path-based unique tracking
const analyze_session_data_structure = (
  session_data_object,
  analysis_path = '',
  frequency = 1,
  global_path_tracker = null,
  raw_data_tracker = null
) => {
  const session_structure_analysis = {
    frequency
  }

  // Track raw data patterns for deeper analysis
  if (raw_data_tracker && analysis_path) {
    if (!raw_data_tracker.has(analysis_path)) {
      raw_data_tracker.set(analysis_path, {
        samples: new Set(),
        data_types: new Set(),
        special_patterns: new Set()
      })
    }

    const raw_tracker = raw_data_tracker.get(analysis_path)

    // Detect special patterns in the data
    if (typeof session_data_object === 'string') {
      // Detect content types
      if (session_data_object.includes('thinking.')) {
        raw_tracker.special_patterns.add('thinking_content')
      }
      if (session_data_object.includes('toolUseResult')) {
        raw_tracker.special_patterns.add('tool_use_result')
      }
      if (session_data_object.match(/^\w+\/\w+$/)) {
        raw_tracker.special_patterns.add('content_type_pattern')
      }
    }

    // Store sample data (limit to prevent memory issues)
    if (raw_tracker.samples.size < 100) {
      try {
        const sample_str =
          typeof session_data_object === 'object'
            ? JSON.stringify(session_data_object).substring(0, 200)
            : String(session_data_object).substring(0, 200)
        raw_tracker.samples.add(sample_str)
      } catch (e) {
        // Skip problematic samples
      }
    }

    raw_tracker.data_types.add(typeof session_data_object)
  }

  if (session_data_object === null)
    return { type: 'null', frequency, path: analysis_path }
  if (session_data_object === undefined)
    return { type: 'undefined', frequency, path: analysis_path }

  if (Array.isArray(session_data_object)) {
    session_structure_analysis.type = 'array'
    session_structure_analysis.length = session_data_object.length
    session_structure_analysis.min_length = session_data_object.length
    session_structure_analysis.max_length = session_data_object.length

    if (session_data_object.length > 0) {
      session_structure_analysis.item_types = [
        ...new Set(
          session_data_object.map((array_item) => {
            if (array_item === null) return 'null'
            if (array_item === undefined) return 'undefined'
            if (Array.isArray(array_item)) return 'array'
            return typeof array_item
          })
        )
      ]

      // Process array items with proper path notation
      const sample_count = Math.min(10, session_data_object.length)
      session_structure_analysis.sample_items = session_data_object
        .slice(0, sample_count)
        .map((sample_item, index) => {
          const item_path = analysis_path ? `${analysis_path}[]` : '[]'
          return typeof sample_item === 'object' && sample_item !== null
            ? analyze_session_data_structure(
                sample_item,
                item_path,
                frequency,
                global_path_tracker,
                raw_data_tracker
              )
            : {
                type: typeof sample_item,
                sample_values: sample_item,
                frequency,
                path: item_path
              }
        })
    }
  } else if (typeof session_data_object === 'object') {
    session_structure_analysis.type = 'object'
    session_structure_analysis.properties = {}
    session_structure_analysis.property_count =
      Object.keys(session_data_object).length

    for (const [object_property_key, property_value] of Object.entries(
      session_data_object
    )) {
      const property_path = analysis_path
        ? `${analysis_path}.${object_property_key}`
        : object_property_key
      session_structure_analysis.properties[object_property_key] =
        analyze_session_data_structure(
          property_value,
          property_path,
          frequency,
          global_path_tracker,
          raw_data_tracker
        )
    }
  } else {
    session_structure_analysis.type = typeof session_data_object
    session_structure_analysis.path = analysis_path

    if (typeof session_data_object === 'string') {
      session_structure_analysis.length = session_data_object.length
      session_structure_analysis.min_length = session_data_object.length
      session_structure_analysis.max_length = session_data_object.length

      // Track unique values globally by path
      if (global_path_tracker && analysis_path) {
        if (!global_path_tracker.has(analysis_path)) {
          global_path_tracker.set(analysis_path, {
            type: 'string',
            unique_values: new Set(),
            frequency: 0,
            min_length: Infinity,
            max_length: 0
          })
        }

        const path_data = global_path_tracker.get(analysis_path)
        path_data.unique_values.add(session_data_object)
        path_data.frequency += frequency
        path_data.min_length = Math.min(
          path_data.min_length,
          session_data_object.length
        )
        path_data.max_length = Math.max(
          path_data.max_length,
          session_data_object.length
        )
      }

      // Provide sample for now (will be replaced in final output)
      if (session_data_object.length > 100) {
        session_structure_analysis.sample_values =
          session_data_object.substring(0, 100) + '...'
      } else {
        session_structure_analysis.sample_values = session_data_object
      }
    } else if (typeof session_data_object === 'number') {
      session_structure_analysis.min_value = session_data_object
      session_structure_analysis.max_value = session_data_object
      session_structure_analysis.sample_values = session_data_object

      // Track number paths too
      if (global_path_tracker && analysis_path) {
        if (!global_path_tracker.has(analysis_path)) {
          global_path_tracker.set(analysis_path, {
            type: 'number',
            frequency: 0,
            min_value: Infinity,
            max_value: -Infinity
          })
        }

        const path_data = global_path_tracker.get(analysis_path)
        path_data.frequency += frequency
        path_data.min_value = Math.min(path_data.min_value, session_data_object)
        path_data.max_value = Math.max(path_data.max_value, session_data_object)
      }
    } else {
      session_structure_analysis.sample_values = session_data_object

      // Track other types
      if (global_path_tracker && analysis_path) {
        if (!global_path_tracker.has(analysis_path)) {
          global_path_tracker.set(analysis_path, {
            type: typeof session_data_object,
            frequency: 0
          })
        }

        const path_data = global_path_tracker.get(analysis_path)
        path_data.frequency += frequency
      }
    }
  }

  return session_structure_analysis
}

// Function to find normalized session files recursively
const find_normalized_session_files_recursive = (search_directory) => {
  const normalized_session_file_paths = []

  try {
    const directory_entries = fs.readdirSync(search_directory, {
      withFileTypes: true
    })

    for (const directory_entry of directory_entries) {
      const full_entry_path = path.join(search_directory, directory_entry.name)

      if (directory_entry.isDirectory()) {
        normalized_session_file_paths.push(
          ...find_normalized_session_files_recursive(full_entry_path)
        )
      } else if (
        directory_entry.name.startsWith('normalized-session-') &&
        directory_entry.name.endsWith('.json')
      ) {
        normalized_session_file_paths.push(full_entry_path)
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return normalized_session_file_paths
}

// Function to enhance structure with global path data
const enhance_structure_with_path_data = (structure, global_path_tracker) => {
  const enhance_node = (node, path = '') => {
    if (!node || typeof node !== 'object') return node

    // Enhance this node with global path data if available
    if (path && global_path_tracker.has(path)) {
      const path_data = global_path_tracker.get(path)

      if (path_data.type === 'string') {
        node.unique_count = path_data.unique_values.size
        node.frequency = path_data.frequency
        node.length_range = {
          min: path_data.min_length,
          max: path_data.max_length
        }

        // Include unique values if under threshold
        if (path_data.unique_values.size <= ENUM_MAX_UNIQUE_VALUES) {
          node.unique_values = Array.from(path_data.unique_values).sort()
        } else {
          // Keep existing sample_values for high-cardinality fields
        }
      } else if (path_data.type === 'number') {
        node.frequency = path_data.frequency
        node.value_range = {
          min: path_data.min_value,
          max: path_data.max_value
        }
      } else {
        node.frequency = path_data.frequency
      }
    }

    // Recursively enhance properties
    if (node.properties) {
      for (const [prop_key, prop_node] of Object.entries(node.properties)) {
        const child_path = path ? `${path}.${prop_key}` : prop_key
        enhance_node(prop_node, child_path)
      }
    }

    // Enhance array item properties
    if (node.array_item_properties) {
      for (const [prop_key, prop_node] of Object.entries(
        node.array_item_properties
      )) {
        const child_path = path ? `${path}[].${prop_key}` : `[].${prop_key}`
        enhance_node(prop_node, child_path)
      }
    }

    return node
  }

  return enhance_node(structure, '')
}

// Function to generate comprehensive tree structure with all possible properties
const generate_comprehensive_tree_structure = (
  structure_map,
  provider_name,
  global_path_tracker
) => {
  const tree = {
    provider: provider_name,
    root_type: structure_map.type || 'unknown',
    properties: {},
    metadata: {
      total_sessions: structure_map.frequency || 0,
      generated_at: new Date().toISOString()
    }
  }

  // Collect all unique property paths from array items
  const merge_array_item_structures = (sample_items) => {
    if (!sample_items || sample_items.length === 0) return null

    let merged_structure = null

    for (const item of sample_items) {
      if (item && item.properties) {
        if (!merged_structure) {
          merged_structure = { type: 'object', properties: {} }
        }

        // Merge properties from this item
        for (const [prop_key, prop_value] of Object.entries(item.properties)) {
          if (!merged_structure.properties[prop_key]) {
            merged_structure.properties[prop_key] = { ...prop_value }
          } else {
            // Merge additional info like frequency, ranges, sample values
            const existing = merged_structure.properties[prop_key]
            existing.frequency =
              (existing.frequency || 0) + (prop_value.frequency || 0)

            if (prop_value.min_length !== undefined) {
              existing.min_length = Math.min(
                existing.min_length || Infinity,
                prop_value.min_length
              )
            }
            if (prop_value.max_length !== undefined) {
              existing.max_length = Math.max(
                existing.max_length || 0,
                prop_value.max_length
              )
            }
            if (prop_value.min_value !== undefined) {
              existing.min_value = Math.min(
                existing.min_value || Infinity,
                prop_value.min_value
              )
            }
            if (prop_value.max_value !== undefined) {
              existing.max_value = Math.max(
                existing.max_value || -Infinity,
                prop_value.max_value
              )
            }

            // Merge unique values if available
            if (prop_value.unique_values && existing.unique_values) {
              const all_unique_values = [
                ...new Set([
                  ...existing.unique_values,
                  ...prop_value.unique_values
                ])
              ].sort()
              if (all_unique_values.length <= ENUM_MAX_UNIQUE_VALUES) {
                existing.unique_values = all_unique_values
              } else {
                delete existing.unique_values
              }
            } else if (prop_value.unique_values && !existing.unique_values) {
              existing.unique_values = prop_value.unique_values
            }

            // Update unique count
            if (prop_value.unique_count !== undefined) {
              existing.unique_count = Math.max(
                existing.unique_count || 0,
                prop_value.unique_count
              )
            }

            // Merge sample values
            if (prop_value.sample_values && !existing.unique_values) {
              const existing_samples = existing.sample_values
                ? Array.isArray(existing.sample_values)
                  ? existing.sample_values
                  : [existing.sample_values]
                : []
              const new_samples = Array.isArray(prop_value.sample_values)
                ? prop_value.sample_values
                : [prop_value.sample_values]

              const all_samples = [...existing_samples, ...new_samples]
              const unique_samples = [
                ...new Set(all_samples.map((s) => JSON.stringify(s)))
              ]
                .map((s) => JSON.parse(s))
                .slice(0, 5)

              existing.sample_values =
                unique_samples.length === 1 ? unique_samples[0] : unique_samples
            }
          }
        }
      }
    }

    return merged_structure
  }

  const process_structure = (struct, path = '', level = 0) => {
    if (!struct || typeof struct !== 'object') return null

    const node = {
      type: struct.type,
      path,
      level,
      frequency: struct.frequency || 0
    }

    // Add type-specific information
    if (struct.type === 'array') {
      node.length_range = {
        min: struct.min_length || struct.length || 0,
        max: struct.max_length || struct.length || 0
      }
      node.item_types = struct.item_types || []

      // Instead of sample_items, create a unified structure for array items
      if (struct.sample_items && struct.sample_items.length > 0) {
        const merged_item_structure = merge_array_item_structures(
          struct.sample_items
        )
        if (merged_item_structure && merged_item_structure.properties) {
          node.array_item_properties = {}
          for (const [prop_key, prop_struct] of Object.entries(
            merged_item_structure.properties
          )) {
            const child_path = path ? `${path}[].${prop_key}` : `[].${prop_key}`
            node.array_item_properties[prop_key] = process_structure(
              prop_struct,
              child_path,
              level + 1
            )
          }
        }
      }
    } else if (struct.type === 'object') {
      node.property_count = struct.property_count || 0
      node.properties = {}

      if (struct.properties) {
        for (const [prop_key, prop_struct] of Object.entries(
          struct.properties
        )) {
          const child_path = path ? `${path}.${prop_key}` : prop_key
          node.properties[prop_key] = process_structure(
            prop_struct,
            child_path,
            level + 1
          )
        }
      }
    } else if (struct.type === 'string') {
      node.length_range = {
        min: struct.min_length || struct.length || 0,
        max: struct.max_length || struct.length || 0
      }

      // Add unique count if available
      if (struct.unique_count !== undefined) {
        node.unique_count = struct.unique_count
      }

      // Prefer unique_values over sample_values when available
      if (struct.unique_values !== undefined) {
        node.unique_values = struct.unique_values
      } else if (struct.sample_values !== undefined) {
        node.sample_values = Array.isArray(struct.sample_values)
          ? struct.sample_values.slice(0, 3) // Limit samples
          : [struct.sample_values]
      }
    } else if (struct.type === 'number') {
      if (struct.min_value !== undefined && struct.max_value !== undefined) {
        node.value_range = {
          min: struct.min_value,
          max: struct.max_value
        }
      }
      if (struct.sample_values !== undefined) {
        node.sample_values = Array.isArray(struct.sample_values)
          ? struct.sample_values.slice(0, 3) // Limit samples
          : [struct.sample_values]
      }
    } else {
      if (struct.sample_values !== undefined) {
        node.sample_values = Array.isArray(struct.sample_values)
          ? struct.sample_values.slice(0, 3) // Limit samples
          : [struct.sample_values]
      }
    }

    return node
  }

  if (structure_map.properties) {
    for (const [prop_key, prop_struct] of Object.entries(
      structure_map.properties
    )) {
      tree.properties[prop_key] = process_structure(prop_struct, prop_key, 0)
    }
  } else {
    // Handle non-object root structures
    tree.root_structure = process_structure(structure_map, '', 0)
  }

  return tree
}

// Function to format tree structure for human-readable output
const format_tree_structure = (tree_data) => {
  const lines = []
  lines.push(`Session Provider: ${tree_data.provider}`)
  lines.push(`Root Type: ${tree_data.root_type}`)
  lines.push(`Total Sessions: ${tree_data.metadata.total_sessions}`)
  lines.push(`Generated: ${tree_data.metadata.generated_at}`)
  lines.push('')
  lines.push('Property Tree:')
  lines.push('==============\n')

  // Track visited nodes to prevent infinite recursion
  const visited_paths = new Set()
  const MAX_DEPTH = 10
  const MAX_LINES = 10000

  const format_node = (node, prefix = '', is_last = true, depth = 0) => {
    if (!node || depth > MAX_DEPTH) return []

    // Check for circular references
    const node_key = `${node.path}_${depth}`
    if (visited_paths.has(node_key)) {
      return [
        `${prefix}${is_last ? '└── ' : '├── '}[CIRCULAR REFERENCE: ${node.path}]`
      ]
    }
    visited_paths.add(node_key)

    const node_lines = []
    const connector = is_last ? '└── ' : '├── '
    const type_info = `[${node.type}]`
    const freq_info = node.frequency ? ` (freq: ${node.frequency})` : ''

    let node_description = `${prefix}${connector}${node.path || 'root'} ${type_info}${freq_info}`

    // Add type-specific details
    if (node.type === 'string' && node.length_range) {
      node_description += ` length: ${node.length_range.min}-${node.length_range.max}`
      if (node.unique_count !== undefined) {
        node_description += ` unique: ${node.unique_count}`
      }
    } else if (node.type === 'number' && node.value_range) {
      node_description += ` range: ${node.value_range.min}-${node.value_range.max}`
    } else if (node.type === 'array') {
      node_description += ` length: ${node.length_range?.min || 0}-${node.length_range?.max || 0}`
      if (node.item_types) {
        node_description += ` items: [${node.item_types.join(', ')}]`
      }
    }

    node_lines.push(node_description)

    // Add unique values or sample values
    if (node.unique_values && node.unique_values.length > 0) {
      const values_prefix = prefix + (is_last ? '    ' : '│   ')
      const values = node.unique_values

      // Show all unique values for enums
      node_lines.push(`${values_prefix}📋 Values: [${values.length}]`)
      values.forEach((value) => {
        try {
          const value_str = JSON.stringify(value)
          node_lines.push(`${values_prefix}  • ${value_str}`)
        } catch (e) {
          node_lines.push(`${values_prefix}  • [Unable to serialize value]`)
        }
      })
    } else if (node.sample_values && node.sample_values.length > 0) {
      const sample_prefix = prefix + (is_last ? '    ' : '│   ')
      const samples = Array.isArray(node.sample_values)
        ? node.sample_values
        : [node.sample_values]
      const display_samples = samples.slice(0, 2) // Reduced from 3 to 2 samples

      display_samples.forEach((sample) => {
        try {
          const sample_str =
            typeof sample === 'string' && sample.length > 30
              ? `"${sample.substring(0, 30)}..."`
              : JSON.stringify(sample).substring(0, 100) // Limit JSON string length
          node_lines.push(`${sample_prefix}📝 ${sample_str}`)
        } catch (e) {
          node_lines.push(`${sample_prefix}📝 [Unable to serialize sample]`)
        }
      })

      if (samples.length > 2) {
        node_lines.push(
          `${sample_prefix}... (+${samples.length - 2} more samples)`
        )
      }
    }

    visited_paths.delete(node_key)
    return node_lines
  }

  const process_properties = (properties, prefix = '', depth = 0) => {
    if (!properties || depth > MAX_DEPTH) return []

    const prop_entries = Object.entries(properties)
    const result_lines = []

    // Limit the number of properties to prevent huge output
    const limited_entries = prop_entries.slice(0, 50)

    limited_entries.forEach(([prop_key, prop_node], index) => {
      if (result_lines.length > MAX_LINES) {
        result_lines.push(
          `${prefix}... [Output truncated - too many properties]`
        )
        return
      }

      const is_last_prop = index === limited_entries.length - 1
      const node_lines = format_node(prop_node, prefix, is_last_prop, depth)
      result_lines.push(...node_lines)

      // Process nested properties with depth limit
      if (prop_node && prop_node.properties && depth < MAX_DEPTH - 1) {
        const child_prefix = prefix + (is_last_prop ? '    ' : '│   ')
        const child_lines = process_properties(
          prop_node.properties,
          child_prefix,
          depth + 1
        )
        result_lines.push(...child_lines)
      }

      // Process array item properties (unified structure)
      if (
        prop_node &&
        prop_node.array_item_properties &&
        depth < MAX_DEPTH - 1
      ) {
        const child_prefix = prefix + (is_last_prop ? '    ' : '│   ')
        const array_prop_lines = process_properties(
          prop_node.array_item_properties,
          child_prefix,
          depth + 1
        )
        result_lines.push(...array_prop_lines)
      }
    })

    if (prop_entries.length > 50) {
      result_lines.push(
        `${prefix}... (+${prop_entries.length - 50} more properties)`
      )
    }

    return result_lines
  }

  try {
    if (tree_data.properties) {
      const property_lines = process_properties(tree_data.properties)
      lines.push(...property_lines)
    } else if (tree_data.root_structure) {
      const root_lines = format_node(tree_data.root_structure, '', true)
      lines.push(...root_lines)
    }
  } catch (error) {
    lines.push(`Error formatting tree: ${error.message}`)
    lines.push(
      'Tree structure may be too complex or contain circular references.'
    )
  }

  return lines.join('\n')
}

// Helper function to count total property paths
const count_property_paths = (tree_data) => {
  let count = 0

  const count_paths = (node) => {
    if (!node) return

    if (node.path) count++

    if (node.properties) {
      Object.values(node.properties).forEach(count_paths)
    }

    if (node.array_item_properties) {
      Object.values(node.array_item_properties).forEach(count_paths)
    }
  }

  if (tree_data.properties) {
    Object.values(tree_data.properties).forEach(count_paths)
  } else if (tree_data.root_structure) {
    count_paths(tree_data.root_structure)
  }

  return count
}

// Main session provider analysis function
const analyze_session_providers_main = async () => {
  console.log('Finding normalized session files...')
  const normalized_session_file_paths = find_normalized_session_files_recursive(
    normalized_session_thread_directory
  )
  console.log(
    `Found ${normalized_session_file_paths.length} normalized session files`
  )

  const session_provider_structure_maps = {}
  const session_provider_counts = {}
  const global_path_tracker = new Map() // Track all unique paths across all providers
  const raw_data_tracker = new Map() // Track raw data patterns for deeper analysis

  for (const normalized_session_file_path of normalized_session_file_paths) {
    try {
      console.log(`Analyzing: ${normalized_session_file_path}`)

      // Read the normalized session file
      const normalized_session_file_content = fs.readFileSync(
        normalized_session_file_path,
        'utf8'
      )
      const parsed_session_data = JSON.parse(normalized_session_file_content)

      // Get the provider from the parent metadata.json and the normalized session data
      const thread_directory_path = path.dirname(
        path.dirname(normalized_session_file_path)
      )
      const thread_metadata_file_path = path.join(
        thread_directory_path,
        'metadata.json'
      )

      let session_provider_name = 'unknown'
      if (fs.existsSync(thread_metadata_file_path)) {
        const thread_metadata = JSON.parse(
          fs.readFileSync(thread_metadata_file_path, 'utf8')
        )
        session_provider_name = thread_metadata.source?.provider || 'unknown'
      }

      // Also check session_provider in the normalized data
      if (
        session_provider_name === 'unknown' &&
        parsed_session_data.session_provider
      ) {
        session_provider_name = parsed_session_data.session_provider
      }
      if (session_provider_name === 'unknown' && parsed_session_data.provider) {
        session_provider_name = parsed_session_data.provider
      }

      console.log(`  Provider: ${session_provider_name}`)

      // Initialize provider map if not exists
      if (!session_provider_structure_maps[session_provider_name]) {
        session_provider_structure_maps[session_provider_name] = {}
        session_provider_counts[session_provider_name] = 0
      }

      session_provider_counts[session_provider_name]++

      // Analyze the structure with global path tracking
      const session_data_structure = analyze_session_data_structure(
        parsed_session_data,
        '',
        1,
        global_path_tracker,
        raw_data_tracker
      )

      // Deep merge with existing provider map
      session_provider_structure_maps[session_provider_name] =
        deep_merge_session_data(
          session_provider_structure_maps[session_provider_name],
          session_data_structure
        )
    } catch (error) {
      console.error(
        `Error analyzing ${normalized_session_file_path}:`,
        error.message
      )
    }
  }

  console.log('\nProvider counts:')
  for (const [session_provider_name, session_count] of Object.entries(
    session_provider_counts
  )) {
    console.log(`  ${session_provider_name}: ${session_count} sessions`)
  }

  // Save provider structure maps and generate comprehensive outputs
  for (const [session_provider_name, provider_structure_map] of Object.entries(
    session_provider_structure_maps
  )) {
    // Generate comprehensive tree structure
    const comprehensive_tree = generate_comprehensive_tree_structure(
      provider_structure_map,
      session_provider_name,
      global_path_tracker
    )

    // Enhance the tree with global path data
    enhance_structure_with_path_data(comprehensive_tree, global_path_tracker)

    const provider_tree_output_file = path.join(
      __dirname,
      `${session_provider_name}-tree.json`
    )
    fs.writeFileSync(
      provider_tree_output_file,
      JSON.stringify(comprehensive_tree, null, 2)
    )
    console.log(
      `Saved ${session_provider_name} tree to: ${provider_tree_output_file}`
    )

    // Generate human-readable tree visualization
    const tree_visualization = format_tree_structure(comprehensive_tree)
    const provider_tree_text_file = path.join(
      __dirname,
      `${session_provider_name}-tree.txt`
    )
    fs.writeFileSync(provider_tree_text_file, tree_visualization)
    console.log(
      `Saved ${session_provider_name} tree visualization to: ${provider_tree_text_file}`
    )

    // Save enhanced summary
    const provider_summary_output_file = path.join(
      __dirname,
      `${session_provider_name}-summary.json`
    )
    const provider_analysis_summary = {
      provider: session_provider_name,
      session_count: session_provider_counts[session_provider_name],
      top_level_properties: Object.keys(
        provider_structure_map.properties || {}
      ),
      total_property_paths: count_property_paths(comprehensive_tree),
      analysis_timestamp: new Date().toISOString()
    }
    fs.writeFileSync(
      provider_summary_output_file,
      JSON.stringify(provider_analysis_summary, null, 2)
    )
    console.log(
      `Saved ${session_provider_name} summary to: ${provider_summary_output_file}`
    )
  }

  // Save global path analysis
  const path_analysis = {}
  for (const [path, data] of global_path_tracker.entries()) {
    const analysis_entry = {
      type: data.type,
      frequency: data.frequency,
      path
    }

    if (data.type === 'string') {
      analysis_entry.unique_count = data.unique_values.size
      analysis_entry.length_range = {
        min: data.min_length,
        max: data.max_length
      }
      if (data.unique_values.size <= ENUM_MAX_UNIQUE_VALUES) {
        analysis_entry.unique_values = Array.from(data.unique_values).sort()
      }
    } else if (data.type === 'number') {
      analysis_entry.value_range = {
        min: data.min_value,
        max: data.max_value
      }
    }

    path_analysis[path] = analysis_entry
  }

  const global_path_analysis_file = path.join(
    __dirname,
    'global-path-analysis.json'
  )
  fs.writeFileSync(
    global_path_analysis_file,
    JSON.stringify(path_analysis, null, 2)
  )
  console.log(`\nSaved global path analysis to: ${global_path_analysis_file}`)

  // Save raw data pattern analysis
  const raw_data_patterns = {}
  for (const [path, data] of raw_data_tracker.entries()) {
    if (data.special_patterns.size > 0 || data.samples.size > 0) {
      raw_data_patterns[path] = {
        special_patterns: Array.from(data.special_patterns),
        data_types: Array.from(data.data_types),
        sample_count: data.samples.size,
        samples: Array.from(data.samples).slice(0, 10) // Limit samples in output
      }
    }
  }

  const raw_data_patterns_file = path.join(__dirname, 'raw-data-patterns.json')
  fs.writeFileSync(
    raw_data_patterns_file,
    JSON.stringify(raw_data_patterns, null, 2)
  )
  console.log(`Saved raw data patterns to: ${raw_data_patterns_file}`)

  // Create a combined analysis overview
  const session_analysis_overview = {
    total_sessions: Object.values(session_provider_counts).reduce(
      (total_count, provider_count) => total_count + provider_count,
      0
    ),
    providers: Object.keys(session_provider_structure_maps),
    provider_counts: session_provider_counts,
    total_unique_paths: global_path_tracker.size,
    analysis_timestamp: new Date().toISOString(),
    files_analyzed: normalized_session_file_paths.length
  }

  const analysis_overview_output_file = path.join(
    __dirname,
    'session-analysis-overview.json'
  )
  fs.writeFileSync(
    analysis_overview_output_file,
    JSON.stringify(session_analysis_overview, null, 2)
  )
  console.log(`\nSaved overview to: ${analysis_overview_output_file}`)

  return {
    providerMaps: session_provider_structure_maps,
    providerCounts: session_provider_counts,
    overview: session_analysis_overview
  }
}

// Run the session provider analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  analyze_session_providers_main()
    .then((analysis_result) => {
      console.log('\nAnalysis complete!')
      console.log(
        `Total providers analyzed: ${analysis_result.overview.providers.length}`
      )
      console.log(`Total sessions: ${analysis_result.overview.total_sessions}`)
    })
    .catch((analysis_error) => {
      console.error('Analysis failed:', analysis_error)
      process.exit(1)
    })
}

export default analyze_session_providers_main
