import { spawn } from 'child_process'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('ripgrep-search')

class RipgrepSearch {
  constructor() {
    this.user_base_dir =
      config.user_base_directory || process.env.USER_BASE_DIRECTORY
    if (!this.user_base_dir) {
      throw new Error('USER_BASE_DIRECTORY not configured')
    }
  }

  async _execute_ripgrep(args, options = {}) {
    return new Promise((resolve, reject) => {
      const { cwd = this.user_base_dir, timeout = 30000 } = options

      log(`Executing: rg ${args.join(' ')} in ${cwd}`)

      const process = spawn('rg', args, { cwd })
      let stdout = ''
      let stderr = ''

      const timer = setTimeout(() => {
        process.kill('SIGTERM')
        reject(new Error('Ripgrep search timed out'))
      }, timeout)

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        clearTimeout(timer)

        // Ripgrep exits with code 1 when no matches found, which is not an error
        if (code === 0 || code === 1) {
          resolve({ stdout, stderr, code })
        } else {
          reject(new Error(`Ripgrep failed with code ${code}: ${stderr}`))
        }
      })

      process.on('error', (error) => {
        clearTimeout(timer)
        reject(new Error(`Failed to execute ripgrep: ${error.message}`))
      })
    })
  }

  async _parse_ripgrep_output(output, options = {}) {
    const { include_content = false, include_line_numbers = false } = options

    if (!output.trim()) {
      return []
    }

    const lines = output.trim().split('\n')
    const results = []

    for (const line of lines) {
      if (!line.trim()) continue

      let file_path, line_number, content

      if (include_line_numbers) {
        // Format: file:line:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/)
        if (match) {
          file_path = match[1]
          line_number = parseInt(match[2])
          content = match[3]
        }
      } else {
        // Format: file:content or just file
        if (include_content) {
          const match = line.match(/^([^:]+):(.*)$/)
          if (match) {
            file_path = match[1]
            content = match[2]
          }
        } else {
          file_path = line
        }
      }

      if (file_path) {
        const result = {
          file_path: file_path.startsWith(this.user_base_dir)
            ? path.relative(this.user_base_dir, file_path)
            : file_path
        }

        if (line_number !== undefined) {
          result.line_number = line_number
        }

        if (content !== undefined) {
          result.content = content
        }

        results.push(result)
      }
    }

    return results
  }

  async search_content(pattern, options = {}) {
    const {
      include_line_numbers = false,
      include_content = true,
      case_sensitive = false,
      file_types = [],
      exclude_dirs = ['.git', '.system', 'node_modules'],
      max_results = 100
    } = options

    const args = [
      pattern,
      '--type',
      'md', // Search only markdown files by default
      '--no-heading',
      '--no-filename',
      case_sensitive ? '--case-sensitive' : '--ignore-case'
    ]

    if (include_line_numbers) {
      args.push('--line-number')
    }

    if (!include_content) {
      args.push('--files-with-matches')
    }

    // Add file type filters
    for (const file_type of file_types) {
      args.push('--type', file_type)
    }

    // Add directory exclusions
    for (const exclude_dir of exclude_dirs) {
      args.push('--glob', `!${exclude_dir}/**`)
    }

    // Limit results
    args.push('--max-count', max_results.toString())

    try {
      const result = await this._execute_ripgrep(args)
      return await this._parse_ripgrep_output(result.stdout, {
        include_content,
        include_line_numbers
      })
    } catch (error) {
      log('Content search failed:', error.message)
      return []
    }
  }

  async get_file_matches_count(pattern, options = {}) {
    const args = [
      pattern,
      '--type',
      'md',
      '--count-matches',
      '--no-filename',
      '--glob',
      '!.git/**',
      '--glob',
      '!.system/**',
      '--glob',
      '!node_modules/**'
    ]

    try {
      const result = await this._execute_ripgrep(args)
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim())
      return lines.reduce((total, line) => {
        const count = parseInt(line) || 0
        return total + count
      }, 0)
    } catch (error) {
      log('Count search failed:', error.message)
      return 0
    }
  }

  // Check if ripgrep is available
  static async check_availability() {
    try {
      const process = spawn('rg', ['--version'])
      return new Promise((resolve) => {
        process.on('close', (code) => {
          resolve(code === 0)
        })
        process.on('error', () => {
          resolve(false)
        })
      })
    } catch (error) {
      return false
    }
  }
}

export default RipgrepSearch
export { RipgrepSearch }
