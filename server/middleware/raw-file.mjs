import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { is_raw_request, get_content_type } from '#server/utils/raw-request.mjs'
import { PermissionContext } from '#server/middleware/permission/permission-context.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { is_path_within_directory } from '#libs-server/utils/is-path-within-directory.mjs'

const log = debug('server:raw-file')

export function create_raw_file_middleware() {
  const user_base_dir = config.user_base_directory
  const system_base_dir = config.system_base_directory

  return async (req, res, next) => {
    const { is_raw, file_path } = is_raw_request(req)

    if (!is_raw) {
      return next()
    }

    log(`Raw file request: ${file_path}`)

    try {
      // Resolve to absolute path
      const is_system_path = file_path.startsWith('repository/active/base/')
      const absolute_path = is_system_path
        ? path.resolve(
            system_base_dir,
            file_path.replace(/^repository\/active\/base\//, '')
          )
        : path.resolve(user_base_dir, file_path)

      // Validate path is within allowed directories
      if (
        !is_path_within_directory(absolute_path, user_base_dir) &&
        !is_path_within_directory(absolute_path, system_base_dir)
      ) {
        log(`Path traversal attempt: ${file_path}`)
        return res.status(404).send('Not found')
      }

      // Check if file exists and is a file (try .md fallback for extensionless paths)
      let resolved_path = absolute_path
      let stats
      try {
        stats = await fs.stat(resolved_path)
      } catch {
        // If no extension, try appending .md (handles ?raw=true on extensionless URLs)
        if (!path.extname(resolved_path)) {
          try {
            resolved_path = absolute_path + '.md'
            stats = await fs.stat(resolved_path)
          } catch {
            return res.status(404).send('Not found')
          }
        } else {
          return res.status(404).send('Not found')
        }
      }

      if (!stats.isFile()) {
        return res.status(404).send('Not found')
      }

      // Check permissions
      const user_public_key = req.user?.user_public_key || null
      const context = new PermissionContext({ user_public_key })
      const resource_path = create_base_uri_from_path(resolved_path)
      const result = await context.check_permission({ resource_path })

      if (!result.read.allowed) {
        log(`Permission denied for ${resource_path}: ${result.read.reason}`)
        return res.status(404).send('Not found')
      }

      // Read and serve file
      const content = await fs.readFile(resolved_path, 'utf-8')
      const content_type = get_content_type(resolved_path)

      res.set({
        'Content-Type': content_type,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      })

      res.send(content)
      log(`Served raw file: ${file_path}`)
    } catch (error) {
      log(`Error serving raw file ${file_path}: ${error.message}`)
      return res.status(404).send('Not found')
    }
  }
}
