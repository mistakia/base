/**
 * Apple Notes Collector
 *
 * Scans Apple Notes via AppleScript to index notes as files and folders.
 * Uses batch property access (e.g. "name of every note of aFolder") which
 * is orders of magnitude faster than per-note JXA access for large collections.
 *
 * URI scheme: apple-notes://<account>/<folder>/<title>
 */

import { execFileSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Build AppleScript that batch-fetches note metadata.
 * Returns pipe-delimited lines: account|||folder|||title|||created|||modified
 */
function build_applescript() {
  return `
tell application "Notes"
    set noteList to {}
    repeat with anAccount in accounts
        set acctName to name of anAccount
        repeat with aFolder in folders of anAccount
            set folderName to name of aFolder
            try
                set noteNames to name of every note of aFolder
                set noteCreated to creation date of every note of aFolder
                set noteModified to modification date of every note of aFolder
                repeat with i from 1 to count of noteNames
                    set end of noteList to acctName & "|||" & folderName & "|||" & (item i of noteNames) & "|||" & ((item i of noteCreated) as string) & "|||" & ((item i of noteModified) as string)
                end repeat
            end try
        end repeat
    end repeat
    set AppleScript's text item delimiters to linefeed
    return noteList as text
end tell
`
}

/**
 * Parse AppleScript date string to ISO 8601.
 * AppleScript dates look like: "Sunday, September 10, 2017 at 9:39:27 AM"
 */
function parse_applescript_date(date_str) {
  if (!date_str) return null
  try {
    const d = new Date(date_str.replace(' at ', ' '))
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch {
    return null
  }
}

/**
 * Build a base_uri for a note, handling title collisions with a disambiguator.
 */
function build_note_uri(account, folder, title, seen_uris) {
  const safe_title = title.replace(/\//g, '-')
  const base = `apple-notes://${account}/${folder}/${safe_title}`

  const count = seen_uris.get(base) || 0
  seen_uris.set(base, count + 1)

  if (count === 0) return base
  return `${base} (${count + 1})`
}

/**
 * Scan Apple Notes and return file and folder records.
 *
 * @returns {Object} { files: Array, folders: Array }
 */
export async function scan() {
  const script = build_applescript()

  const script_path = join(tmpdir(), `apple-notes-scan-${Date.now()}.scpt`)
  writeFileSync(script_path, script, 'utf-8')

  let output
  try {
    output = execFileSync('osascript', [script_path], {
      maxBuffer: 200 * 1024 * 1024,
      timeout: 300000,
      encoding: 'utf-8'
    })
  } catch (error) {
    throw new Error(`Failed to extract notes via AppleScript: ${error.message}`)
  } finally {
    try {
      unlinkSync(script_path)
    } catch {
      // ignore cleanup errors
    }
  }

  const lines = output.trim().split('\n').filter(Boolean)
  const now = new Date().toISOString()
  const files = []
  const seen_uris = new Map()
  const folder_agg = new Map()

  for (const line of lines) {
    const parts = line.split('|||')
    if (parts.length < 5) continue

    const [account, folder, title, , modified_str] = parts
    const modified = parse_applescript_date(modified_str)

    const base_uri = build_note_uri(account, folder, title, seen_uris)

    files.push({
      base_uri,
      name: title,
      mime_type: 'text/html',
      size: 0,
      modified_at: modified,
      source: 'apple-notes',
      cid: null,
      scanned_at: now
    })

    // Aggregate folder stats
    const folder_key = `${account}/${folder}`
    if (!folder_agg.has(folder_key)) {
      folder_agg.set(folder_key, {
        account,
        folder,
        file_count: 0,
        total_size: 0,
        latest_modified: null
      })
    }
    const agg = folder_agg.get(folder_key)
    agg.file_count++
    if (modified && (!agg.latest_modified || modified > agg.latest_modified)) {
      agg.latest_modified = modified
    }
  }

  // Build folder records
  const folders = []
  for (const agg of folder_agg.values()) {
    folders.push({
      base_uri: `apple-notes://${agg.account}/${agg.folder}/`,
      folder_name: agg.folder,
      file_count: agg.file_count,
      subfolder_count: 0,
      total_size: agg.total_size,
      deepest_depth: 0,
      modified_at: agg.latest_modified,
      scanned_at: now
    })
  }

  return { files, folders }
}
