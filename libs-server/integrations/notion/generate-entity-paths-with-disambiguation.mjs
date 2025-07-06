/**
 * Enhanced entity path generation with database-aware conflict resolution
 */

import debug from 'debug'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { sanitize_for_filename } from '#libs-server/utils/sanitize-filename.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { get_database_name } from './notion-entity-mapper.mjs'

const log = debug('integrations:notion:generate-paths')

/**
 * Generate entity paths with database-aware conflict resolution
 *
 * This function creates filenames that disambiguate between entities from different
 * Notion databases that have the same name. When a conflict is detected, it appends
 * the database name to create a unique, semantically meaningful filename.
 *
 * @param {Object} entity_properties - Normalized entity properties
 * @param {string} external_id - The external ID for this entity
 * @param {string} [database_id=null] - Notion database ID (null for standalone pages)
 * @returns {Object} Object with base_uri and absolute_path
 */
export async function generate_entity_paths_with_database_disambiguation({
  entity_properties,
  external_id,
  database_id = null
}) {
  try {
    log(
      `Generating paths for entity: ${entity_properties.name || entity_properties.title}`
    )

    // Convert title to filename-safe format
    const base_safe_name = sanitize_for_filename(
      entity_properties.title || entity_properties.name || 'untitled',
      {
        maxLength: 100,
        fallback: 'untitled'
      }
    )

    // Use entity type for directory - convert underscores to hyphens for consistency
    const directory = entity_properties.type.replace(/_/g, '-')

    let safe_name = base_safe_name

    // Check if base name conflicts with existing entity
    const base_uri = `user:${directory}/${safe_name}.md`
    const base_absolute_path = resolve_base_uri_from_registry(base_uri)

    log(`Checking for conflicts at base path: ${base_absolute_path}`)

    const base_file_exists = await file_exists_in_filesystem({
      absolute_path: base_absolute_path
    })

    if (base_file_exists) {
      log('File exists at base path, checking for external_id conflict')

      // Read existing entity to check external_id
      const existing_entity_result = await read_entity_from_filesystem({
        absolute_path: base_absolute_path
      })

      if (existing_entity_result.success) {
        const existing_external_id =
          existing_entity_result.entity_properties.external_id

        // If existing entity has different external_id, we need disambiguation
        if (existing_external_id && existing_external_id !== external_id) {
          log(
            `External ID conflict detected. Existing: ${existing_external_id}, New: ${external_id}`
          )

          // Get disambiguating suffix
          let disambiguating_suffix = null

          if (database_id) {
            // Get database name from mapping
            const database_name = get_database_name(database_id)
            if (database_name) {
              disambiguating_suffix = sanitize_for_filename(database_name, {
                maxLength: 50,
                fallback: database_id.slice(-8) // fallback to last 8 chars of ID
              })
              log(
                `Using database name for disambiguation: ${disambiguating_suffix}`
              )
            } else {
              // Fallback to database ID suffix
              disambiguating_suffix = database_id.slice(-8)
              log(
                `Using database ID suffix for disambiguation: ${disambiguating_suffix}`
              )
            }
          } else {
            // For standalone pages, use the external system name
            const external_parts = external_id.split(':')
            disambiguating_suffix = external_parts[0] || 'notion'
            log(
              `Using external system name for disambiguation: ${disambiguating_suffix}`
            )
          }

          // Create disambiguated filename and check for further conflicts
          if (disambiguating_suffix) {
            let candidate_name = `${base_safe_name}-${disambiguating_suffix}`
            let counter = 1

            // Check if the disambiguated name also conflicts
            while (true) {
              const candidate_uri = `user:${directory}/${candidate_name}.md`
              const candidate_path =
                resolve_base_uri_from_registry(candidate_uri)

              const candidate_exists = await file_exists_in_filesystem({
                absolute_path: candidate_path
              })

              if (!candidate_exists) {
                // Found a non-conflicting name
                safe_name = candidate_name
                log(`Generated disambiguated filename: ${safe_name}`)
                break
              }

              // Check if existing file has the same external_id (shouldn't happen, but safety check)
              const existing_candidate_result =
                await read_entity_from_filesystem({
                  absolute_path: candidate_path
                })

              if (existing_candidate_result.success) {
                const existing_candidate_external_id =
                  existing_candidate_result.entity_properties.external_id

                if (existing_candidate_external_id === external_id) {
                  // Same external_id, this is the same entity
                  safe_name = candidate_name
                  log(`Found existing file with same external_id: ${safe_name}`)
                  break
                }
              }

              // Name conflicts, try with counter
              counter++
              candidate_name = `${base_safe_name}-${disambiguating_suffix}-${counter}`
              log(`Name conflict detected, trying: ${candidate_name}`)
            }
          }
        } else if (existing_external_id === external_id) {
          log('External ID matches existing entity - no conflict')
        } else {
          log('Existing entity has no external_id - potential legacy entity')
          // For safety, still disambiguate when no external_id exists on existing entity
          if (database_id) {
            const database_name = get_database_name(database_id)
            if (database_name) {
              const disambiguating_suffix = sanitize_for_filename(
                database_name,
                {
                  maxLength: 50,
                  fallback: database_id.slice(-8)
                }
              )
              safe_name = `${base_safe_name}-${disambiguating_suffix}`
              log(`Disambiguated due to missing external_id: ${safe_name}`)
            }
          }
        }
      } else {
        log('Could not read existing entity file - proceeding with base name')
      }
    } else {
      log('No file exists at base path - using base name')
    }

    // Create final base URI and resolve to absolute path
    const final_base_uri = `user:${directory}/${safe_name}.md`
    const final_absolute_path = resolve_base_uri_from_registry(final_base_uri)

    log(`Final paths - URI: ${final_base_uri}, Path: ${final_absolute_path}`)

    return {
      base_uri: final_base_uri,
      absolute_path: final_absolute_path,
      was_disambiguated: safe_name !== base_safe_name
    }
  } catch (error) {
    log(`Error generating entity paths: ${error.message}`)
    throw new Error(`Failed to generate entity paths: ${error.message}`)
  }
}
