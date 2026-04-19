import { expect } from 'chai'

import { collect_timeline_backstop_metrics } from '#libs-server/stats/collector/timeline-backstop-collector.mjs'
import {
  increment_timeline_backstop_counter,
  read_and_reset_timeline_backstop_counter
} from '#libs-server/threads/timeline-backstop-counter.mjs'

describe('collect_timeline_backstop_metrics', () => {
  beforeEach(() => {
    read_and_reset_timeline_backstop_counter()
  })

  it('emits a single metric row with the accumulated count and resets the counter', async () => {
    increment_timeline_backstop_counter()
    increment_timeline_backstop_counter()
    increment_timeline_backstop_counter()

    const snapshot_date = '2026-04-19'
    const metrics = await collect_timeline_backstop_metrics({ snapshot_date })

    expect(metrics).to.be.an('array').with.lengthOf(1)
    expect(metrics[0]).to.deep.include({
      snapshot_date,
      category: 'timeline',
      metric_name: 'schema_version_backstop_count',
      metric_value: 3,
      unit: 'count'
    })
    expect(metrics[0].dimensions).to.deep.equal({})

    // Counter has been drained
    expect(read_and_reset_timeline_backstop_counter()).to.equal(0)
  })

  it('emits a zero-valued metric when the counter is empty', async () => {
    const metrics = await collect_timeline_backstop_metrics({
      snapshot_date: '2026-04-19'
    })
    expect(metrics).to.have.lengthOf(1)
    expect(metrics[0].metric_value).to.equal(0)
  })
})
