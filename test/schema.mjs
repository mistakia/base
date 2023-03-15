/* global describe, it */

import chai from 'chai'
import chai_http from 'chai-http'

import db from '#db'
import config from '#config'

chai.use(chai_http)

const expect = chai.expect

describe('check schema', () => {
  it('should have tables', async () => {
    const tables = await db('information_schema.tables')
      .where('table_schema', config.mysql.connection.database)
      .select('table_name')

    expect(tables).to.have.lengthOf(21)
  })
})
