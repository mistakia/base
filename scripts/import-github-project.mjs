import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
// import config from '#config'
import { isMain, github } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-github-project')
debug.enable('import-github-project')

const import_github_project = async ({
  username,
  project_number,
  github_token,
  user_id
}) => {
  user_id = Buffer.from(user_id, 'hex')
  const response = await github.get_github_project({
    username,
    project_number,
    github_token
  })
  const insert_items = []

  for (const item of response.data.user.projectV2.items.nodes) {
    const get_field = (name) => {
      const field = item.fieldValues.nodes.find(
        (node) => node.field && node.field.name === name
      )

      return field || {}
    }

    insert_items.push({
      text_input: get_field('Title').text,
      status: get_field('Status').name,
      start_by: get_field('start_by').date,
      finish_by: get_field('finish_by').date,
      created_at: get_field('created_at').date,
      updated_at: get_field('updated_at').date,
      finished_at: get_field('finished_at').date,
      external_id: item.id,
      external_url: item.content.url,
      user_id
    })
  }

  log(insert_items[0])

  if (insert_items.length) {
    await db('tasks').insert(insert_items).onConflict('external_id').merge()
    log(
      `Inserted ${insert_items.length} tasks for ${username}/${project_number}`
    )
  }
}

export default import_github_project

const main = async () => {
  let error
  try {
    await import_github_project({
      username: argv.username,
      project_number: argv.project_number,
      github_token: argv.github_token,
      user_id: argv.user_id
    })
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain) {
  main()
}
