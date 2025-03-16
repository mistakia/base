import debug from 'debug'

import server from '#server/index.mjs'
import config from '#config'

const logger = debug('server')
debug.enable('server,api')

try {
  const { server_port } = config
  server.listen(server_port, () =>
    logger(`API listening on port ${server_port}`)
  )
} catch (err) {
  // TODO move to stderr
  logger(err)
}
