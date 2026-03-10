import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  buffer_report,
  drain_buffer
} from '#libs-server/jobs/job-report-buffer.mjs'

describe('job-report-buffer', function () {
  let tmp_dir
  let buffer_path

  beforeEach(async () => {
    tmp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'job-buffer-test-'))
    buffer_path = path.join(tmp_dir, 'pending-job-reports.jsonl')
  })

  afterEach(async () => {
    await fs.rm(tmp_dir, { recursive: true, force: true })
  })

  describe('buffer_report', () => {
    it('should create file and append a report', async () => {
      const payload = { job_id: 'test-1', success: true }
      await buffer_report({ payload, buffer_path })

      const content = await fs.readFile(buffer_path, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).to.have.lengthOf(1)
      expect(JSON.parse(lines[0])).to.deep.equal(payload)
    })

    it('should append multiple reports', async () => {
      await buffer_report({
        payload: { job_id: 'test-1', success: true },
        buffer_path
      })
      await buffer_report({
        payload: { job_id: 'test-2', success: false },
        buffer_path
      })

      const content = await fs.readFile(buffer_path, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).to.have.lengthOf(2)
      expect(JSON.parse(lines[0]).job_id).to.equal('test-1')
      expect(JSON.parse(lines[1]).job_id).to.equal('test-2')
    })
  })

  describe('drain_buffer', () => {
    it('should send buffered reports and delete file when all succeed', async () => {
      await buffer_report({
        payload: { job_id: 'test-1', success: true },
        buffer_path
      })
      await buffer_report({
        payload: { job_id: 'test-2', success: true },
        buffer_path
      })

      const sent = []
      await drain_buffer({
        buffer_path,
        report_fn: async (payload) => {
          sent.push(payload.job_id)
          return { success: true }
        }
      })

      expect(sent).to.deep.equal(['test-1', 'test-2'])

      // File should be deleted
      try {
        await fs.access(buffer_path)
        expect.fail('Buffer file should have been deleted')
      } catch (err) {
        expect(err.code).to.equal('ENOENT')
      }
    })

    it('should preserve failed reports in the buffer', async () => {
      await buffer_report({
        payload: { job_id: 'test-1', success: true },
        buffer_path
      })
      await buffer_report({
        payload: { job_id: 'test-2', success: false },
        buffer_path
      })
      await buffer_report({
        payload: { job_id: 'test-3', success: true },
        buffer_path
      })

      await drain_buffer({
        buffer_path,
        report_fn: async (payload) => {
          // Fail test-2
          if (payload.job_id === 'test-2') {
            return { success: false }
          }
          return { success: true }
        }
      })

      const content = await fs.readFile(buffer_path, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).to.have.lengthOf(1)
      expect(JSON.parse(lines[0]).job_id).to.equal('test-2')
    })

    it('should handle missing buffer file gracefully', async () => {
      // Should not throw
      await drain_buffer({
        buffer_path: path.join(tmp_dir, 'nonexistent.jsonl'),
        report_fn: async () => ({ success: true })
      })
    })

    it('should handle empty buffer file', async () => {
      await fs.writeFile(buffer_path, '', 'utf-8')

      await drain_buffer({
        buffer_path,
        report_fn: async () => ({ success: true })
      })

      // File should be deleted
      try {
        await fs.access(buffer_path)
        expect.fail('Empty buffer file should have been deleted')
      } catch (err) {
        expect(err.code).to.equal('ENOENT')
      }
    })

    it('should handle report_fn throwing', async () => {
      await buffer_report({
        payload: { job_id: 'test-1', success: true },
        buffer_path
      })

      await drain_buffer({
        buffer_path,
        report_fn: async () => {
          throw new Error('Network error')
        }
      })

      // Failed report should be preserved
      const content = await fs.readFile(buffer_path, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).to.have.lengthOf(1)
      expect(JSON.parse(lines[0]).job_id).to.equal('test-1')
    })
  })
})
