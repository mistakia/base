import Knex from 'knex'
import config from '../config.mjs'

const postgres = Knex(config.postgres)

export default postgres
