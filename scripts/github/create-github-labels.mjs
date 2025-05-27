import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fetch from 'node-fetch'

import { wait, isMain } from '#libs-server'
import config from '#config'
import { default_repos, labels } from '#config/labels.mjs'

const { github_access_token } = config
const logger = debug('create-github-labels')
debug.enable('create-github-labels')

const list_labels = async ({ repo }) => {
  logger(`Getting existing labels in ${repo}`)

  const url = `https://api.github.com/repos/${repo}/labels`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${github_access_token}`
    }
  })

  return res.json()
}

const delete_label = async ({ repo, label_name }) => {
  logger(`Deleting label ${label_name} from ${repo}`)

  const url = `https://api.github.com/repos/${repo}/labels/${label_name}`
  return fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${github_access_token}`
    }
  })
}

const create_label = async ({ repo, name, color, description }) => {
  logger(`Creating label ${name} in ${repo}`)

  const body = {
    name,
    color,
    description
  }
  const url = `https://api.github.com/repos/${repo}/labels`

  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${github_access_token}`
    }
  })
}

const get_labels_for_repo = ({ repo }) => {
  return labels.filter((label) => {
    // Include label if it has no repos specified (global label)
    // or if the repo is in its repos array
    return !label.repos || label.repos.includes(repo)
  })
}

/**
 * Creates GitHub labels for a given repository.
 *
 * @param {string} repo - The repository name in the format 'owner/repo'.
 * @param {boolean} sync - If true, labels not in the default set will be removed from the repository.
 */

const create_github_labels_for_repo = async ({ repo, sync = false }) => {
  logger(`Creating labels in ${repo} (sync: ${sync})`)

  const repo_labels = await list_labels({ repo })
  const repo_label_names = repo_labels.map((label) => label.name)
  const labels_to_create = get_labels_for_repo({ repo })

  logger(`Found ${repo_label_names.length} existing labels in ${repo}`)

  for (const label of labels_to_create) {
    if (repo_label_names.includes(label.name)) {
      continue
    }

    let res
    try {
      res = await create_label({
        ...label,
        repo
      })

      logger(`Successfully created label: ${label.name}, id: ${res.id}`)
    } catch (error) {
      logger(`Failed to create label: ${label.name}`)
      logger(error)
    }

    await wait(3000)
  }

  if (sync) {
    const base_label_names = labels_to_create.map((label) => label.name)

    for (const repo_label_name of repo_label_names) {
      if (!base_label_names.includes(repo_label_name)) {
        await delete_label({ repo, label_name: repo_label_name })
      }
    }
  }
}

const create_github_labels_for_repos = async ({ repos, sync = false }) => {
  for (const repo of repos) {
    await create_github_labels_for_repo({ repo, sync })
  }
}

const argv = yargs(hideBin(process.argv))
  .usage(
    'Usage: $0 (--repo <repository> | --repos <repository1,repository2,...> | --all) [--sync]'
  )
  .option('repo', {
    describe: 'Single GitHub repository in the format "owner/repo"',
    type: 'string',
    conflicts: ['repos', 'all']
  })
  .option('repos', {
    describe: 'Comma-separated list of GitHub repositories',
    type: 'string',
    conflicts: ['repo', 'all']
  })
  .option('all', {
    describe: 'Apply to all default repositories defined in labels.mjs',
    type: 'boolean',
    conflicts: ['repo', 'repos']
  })
  .option('sync', {
    describe:
      'If provided, labels not in the default set will be removed from the repository',
    type: 'boolean',
    default: false
  })
  .check((argv) => {
    if (!argv.repo && !argv.repos && !argv.all) {
      throw new Error('Must provide either --repo, --repos, or --all')
    }
    return true
  })
  .help()
  .alias('help', 'h').argv

if (isMain(import.meta.url)) {
  const main = async () => {
    let repos_to_process = []

    if (argv.all) {
      repos_to_process = default_repos
    } else if (argv.repos) {
      repos_to_process = argv.repos.split(',').map((repo) => repo.trim())
    } else if (argv.repo) {
      repos_to_process = [argv.repo]
    }

    await create_github_labels_for_repos({
      repos: repos_to_process,
      sync: argv.sync
    })
    process.exit()
  }

  try {
    main()
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
}

export default create_github_labels_for_repos
