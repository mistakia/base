/* global describe, it */

import chai from 'chai'
import chai_http from 'chai-http'

import db from '#db'

chai.use(chai_http)

const expect = chai.expect

describe('check schema', () => {
  it('should have tables', async () => {
    const tables = await db('information_schema.tables')
      .where({
        table_schema: 'public',
        table_type: 'BASE TABLE'
      })
      .select('table_name')

    expect(tables).to.have.lengthOf(24)
  })
})
