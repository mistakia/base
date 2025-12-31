import debug from 'debug'

import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { add_tags_to_entity, remove_tags_from_entity } from './manage-entity-tags.mjs'

const log = debug('process-tag-batch')

/**
 * Process tag operations across multiple files using batch processing
 * Follows the exact pattern from update-entity-fields.mjs for consistency
 *
 * @param {Object} options - Function options
 * @param {string} options.operation - Operation type: 'add' or 'remove'
 * @param {string[]} options.resolved_tags - Array of base-uri formatted tags
 * @param {string[]} options.include_path_patterns - Glob patterns for files to include
 * @param {string[]} options.exclude_path_patterns - Glob patterns for files to exclude
 * @param {boolean} options.dry_run - Preview changes without applying them
 * @returns {Promise<Object>} Batch processing results with statistics
 */
export const process_tag_batch = async ({
  operation,
  resolved_tags,
  include_path_patterns = ['*.md'],
  exclude_path_patterns = [],
  dry_run = false
}) => {
  try {
    log('Starting batch tag processing', { operation, resolved_tags, include_path_patterns, exclude_path_patterns, dry_run })

    if (!operation || !['add', 'remove'].includes(operation)) {
      throw new Error('Operation must be either "add" or "remove"')
    }

    if (!resolved_tags || !Array.isArray(resolved_tags) || resolved_tags.length === 0) {
      throw new Error('Resolved tags must be a non-empty array')
    }

    // Process from filesystem using existing pattern
    log('Processing repositories from filesystem...')
    const result = await process_repositories_from_filesystem({
      include_path_patterns,
      exclude_path_patterns
    })

    // Track statistics following update-entity-fields pattern
    let updated_count = 0
    let error_count = 0
    const updated_files = []
    const error_files = []
    const skipped_files = []

    // Process each file with try/catch per file (same pattern as update-entity-fields)
    for (const file of result.files) {
      try {
        // Read entity to get type and current tags
        // (process_repositories_from_filesystem doesn't include entity_properties in returned files)
        const entity_result = await read_entity_from_filesystem({
          absolute_path: file.absolute_path
        })

        if (!entity_result.success) {
          throw new Error(`Failed to read entity: ${entity_result.error}`)
        }

        const { entity_properties } = entity_result
        const entity_type = entity_properties.type

        // Skip entities that are type definitions (same as update-entity-fields)
        if (entity_type === 'type_definition') {
          log(`Skipping ${file.base_uri} (type_definition)`)
          skipped_files.push({
            base_uri: file.base_uri,
            reason: 'type_definition'
          })
          continue
        }

        let operation_result

        if (dry_run) {
          // In dry-run mode, compute what would happen based on current entity state
          // Deduplicate to match actual operation behavior
          const current_tags = entity_properties.tags || []
          const deduplicated_tags = [...new Set(resolved_tags)]

          if (operation === 'add') {
            const tags_to_add = deduplicated_tags.filter(tag => !current_tags.includes(tag))
            const already_has = deduplicated_tags.filter(tag => current_tags.includes(tag))
            operation_result = {
              success: true,
              added_tags: tags_to_add,
              skipped_tags: already_has,
              total_tags: current_tags.length + tags_to_add.length
            }
          } else {
            const tags_to_remove = deduplicated_tags.filter(tag => current_tags.includes(tag))
            const not_found = deduplicated_tags.filter(tag => !current_tags.includes(tag))
            operation_result = {
              success: true,
              removed_tags: tags_to_remove,
              not_found_tags: not_found,
              total_tags: current_tags.length - tags_to_remove.length
            }
          }
        } else {
          // Actually perform the operation
          if (operation === 'add') {
            operation_result = await add_tags_to_entity({
              absolute_path: file.absolute_path,
              tags_to_add: resolved_tags
            })
          } else {
            operation_result = await remove_tags_from_entity({
              absolute_path: file.absolute_path,
              tags_to_remove: resolved_tags
            })
          }
        }

        if (!operation_result.success) {
          throw new Error(operation_result.error)
        }

        // Check if any actual changes were made (or would be made in dry-run)
        const changes_made = operation === 'add'
          ? operation_result.added_tags.length > 0
          : operation_result.removed_tags.length > 0

        if (changes_made) {
          updated_files.push({
            base_uri: file.base_uri,
            operation_details: operation_result
          })
          updated_count++

          if (dry_run) {
            log(`[DRY RUN] Would ${operation} tags on ${file.base_uri}`, operation_result)
          } else {
            log(`Successfully ${operation}ed tags on ${file.base_uri}`, operation_result)
          }
        } else {
          skipped_files.push({
            base_uri: file.base_uri,
            reason: 'no_changes_needed'
          })
          log(`No changes needed for ${file.base_uri}`)
        }
      } catch (err) {
        log(`Error processing ${file.base_uri}:`, err)
        error_files.push({
          base_uri: file.base_uri,
          error: err.message
        })
        error_count++
      }
    }

    // Report results following update-entity-fields pattern
    const operation_name = operation === 'add' ? 'Tag Addition' : 'Tag Removal'
    const dry_run_prefix = dry_run ? '[DRY RUN] ' : ''

    console.log(`\n${dry_run_prefix}${operation_name} Results:`)
    console.log('============================')
    console.log(`Total files processed: ${result.total}`)
    console.log(`Files with validation errors: ${result.files.filter((f) => f.errors && f.errors.length > 0).length}`)
    console.log(`Files ${dry_run ? 'that would be ' : ''}updated: ${updated_count}`)
    console.log(`Files skipped: ${skipped_files.length}`)
    console.log(`Processing errors: ${error_count}`)

    if (updated_count > 0) {
      console.log(`\n${dry_run ? 'Files that would be updated' : 'Updated files'}:`)
      updated_files.forEach((file) => {
        const details = file.operation_details
        if (operation === 'add') {
          const added = details.added_tags.length
          const skipped = details.skipped_tags.length
          console.log(`  • ${file.base_uri} (added: ${added}, already had: ${skipped})`)
        } else {
          const removed = details.removed_tags.length
          const not_found = details.not_found_tags.length
          console.log(`  • ${file.base_uri} (removed: ${removed}, not found: ${not_found})`)
        }
      })
    }

    if (skipped_files.length > 0) {
      console.log('\nSkipped files:')
      skipped_files.forEach((file) => console.log(`  • ${file.base_uri} (${file.reason})`))
    }

    if (error_count > 0) {
      console.log('\nFiles with processing errors:')
      error_files.forEach((file) => console.log(`  • ${file.base_uri}: ${file.error}`))
    }

    return {
      success: error_count === 0,
      total_files: result.total,
      updated_count,
      error_count,
      skipped_count: skipped_files.length,
      updated_files: updated_files.map(f => f.base_uri),
      error_files: error_files.map(f => f.base_uri),
      skipped_files: skipped_files.map(f => f.base_uri),
      operation,
      resolved_tags,
      dry_run
    }
  } catch (error) {
    log('Error in batch tag processing:', error)
    return {
      success: false,
      error: error.message,
      total_files: 0,
      updated_count: 0,
      error_count: 1,
      skipped_count: 0,
      updated_files: [],
      error_files: [],
      skipped_files: [],
      operation,
      resolved_tags,
      dry_run
    }
  }
}
