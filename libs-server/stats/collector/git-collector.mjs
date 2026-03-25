/**
 * Git Metrics Collector
 *
 * Collects commit counts, branch counts, and lines of code across repos.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { get_total_commits, get_branch_count } from '#libs-server/git/repo-statistics.mjs'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('stats:collector:git')

async function get_active_repositories() {
  const active_path = path.join(config.user_base_directory, 'repository', 'active')
  const entries = await fs.readdir(active_path, { withFileTypes: true })
  const repos = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith('-worktrees') || entry.name.startsWith('.')) continue
    const repo_path = path.join(active_path, entry.name)
    try {
      await fs.access(path.join(repo_path, '.git'))
      repos.push({ name: entry.name, path: repo_path })
    } catch {
      // not a git repo
    }
  }

  repos.push({ name: 'user-base', path: config.user_base_directory })
  return repos
}

async function collect_repo_metrics({ snapshot_date, repo }) {
  const metrics = []

  const [total_commits, branch_count] = await Promise.all([
    get_total_commits({ repo_path: repo.path }),
    get_branch_count({ repo_path: repo.path })
  ])

  metrics.push({
    snapshot_date,
    category: 'git',
    metric_name: 'total_commits',
    metric_value: total_commits,
    unit: 'count',
    dimensions: { repo: repo.name }
  })

  metrics.push({
    snapshot_date,
    category: 'git',
    metric_name: 'branch_count',
    metric_value: branch_count,
    unit: 'count',
    dimensions: { repo: repo.name }
  })

  // Daily commits using --since/--until for inclusive day boundaries
  try {
    const { stdout } = await execute_shell_command(
      `git log --oneline --since="${snapshot_date}" --until="${snapshot_date} 23:59:59" | wc -l`,
      { cwd: repo.path, timeout: 10000 }
    )
    const daily = parseInt(stdout.trim(), 10) || 0
    metrics.push({
      snapshot_date,
      category: 'git',
      metric_name: 'commits_today',
      metric_value: daily,
      unit: 'count',
      dimensions: { repo: repo.name }
    })
  } catch {
    // skip daily count on error
  }

  // Lines of code via cloc
  try {
    const { stdout } = await execute_shell_command(
      'cloc --json --vcs=git .',
      { cwd: repo.path, timeout: 60000 }
    )
    const cloc_data = JSON.parse(stdout)
    let repo_total_code = 0

    for (const [lang, data] of Object.entries(cloc_data)) {
      if (lang === 'header' || lang === 'SUM') continue
      metrics.push({
        snapshot_date,
        category: 'git',
        metric_name: 'lines_of_code',
        metric_value: data.code,
        unit: 'lines',
        dimensions: { repo: repo.name, language: lang }
      })
      metrics.push({
        snapshot_date,
        category: 'git',
        metric_name: 'files_by_language',
        metric_value: data.nFiles,
        unit: 'count',
        dimensions: { repo: repo.name, language: lang }
      })
      repo_total_code += data.code
    }

    metrics.push({
      snapshot_date,
      category: 'git',
      metric_name: 'lines_of_code',
      metric_value: repo_total_code,
      unit: 'lines',
      dimensions: { repo: repo.name }
    })
  } catch (err) {
    log('cloc failed for %s: %s', repo.name, err.message)
  }

  return { metrics, total_commits }
}

export async function collect_git_metrics({ snapshot_date }) {
  const repos = await get_active_repositories()

  const results = await Promise.allSettled(
    repos.map(repo => collect_repo_metrics({ snapshot_date, repo }))
  )

  const metrics = []
  let grand_total_commits = 0

  for (const result of results) {
    if (result.status === 'fulfilled') {
      metrics.push(...result.value.metrics)
      grand_total_commits += result.value.total_commits
    }
  }

  metrics.push({
    snapshot_date,
    category: 'git',
    metric_name: 'total_commits',
    metric_value: grand_total_commits,
    unit: 'count',
    dimensions: {}
  })

  log('Collected %d git metrics', metrics.length)
  return metrics
}
