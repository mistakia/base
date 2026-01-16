import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import {
  score_match,
  score_and_rank_results
} from '#libs-server/search/fuzzy-scorer.mjs'
import { search_directories } from '#libs-server/search/directory-search.mjs'

describe('Search Performance Benchmarks', function () {
  this.timeout(30000)

  describe('fuzzy scorer performance', () => {
    const generate_test_paths = (count) => {
      const paths = []
      const directories = [
        'task',
        'workflow',
        'text',
        'guideline',
        'repository/active/league'
      ]
      const extensions = ['.md', '.mjs', '.js', '.json']

      for (let i = 0; i < count; i++) {
        const dir = directories[i % directories.length]
        const ext = extensions[i % extensions.length]
        paths.push({
          file_path: `${dir}/file-${i}${ext}`,
          type: 'file'
        })
      }
      return paths
    }

    it('should score 1000 results in under 100ms', () => {
      const test_paths = generate_test_paths(1000)
      const query = 'task file'

      const start = performance.now()
      const results = score_and_rank_results({
        query,
        results: test_paths,
        limit: 50
      })
      const duration = performance.now() - start

      console.log(`    Scoring 1000 results took ${duration.toFixed(2)}ms`)
      expect(duration).to.be.lessThan(100)
      expect(results.length).to.be.lessThan(1000)
    })

    it('should score 5000 results in under 500ms', () => {
      const test_paths = generate_test_paths(5000)
      const query = 'league readme'

      const start = performance.now()
      score_and_rank_results({
        query,
        results: test_paths,
        limit: 50
      })
      const duration = performance.now() - start

      console.log(`    Scoring 5000 results took ${duration.toFixed(2)}ms`)
      expect(duration).to.be.lessThan(500)
    })

    it('should handle long queries efficiently', () => {
      const test_paths = generate_test_paths(1000)
      const query = 'repository active league readme file'

      const start = performance.now()
      score_and_rank_results({
        query,
        results: test_paths,
        limit: 50
      })
      const duration = performance.now() - start

      console.log(`    Multi-word query scoring took ${duration.toFixed(2)}ms`)
      expect(duration).to.be.lessThan(200)
    })

    it('should score individual paths in under 0.1ms', () => {
      const iterations = 10000
      const query = 'league read'
      const target = 'repository/active/league/README.md'

      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        score_match({ query, target })
      }
      const duration = performance.now() - start
      const per_call = duration / iterations

      console.log(`    Average score_match time: ${per_call.toFixed(4)}ms`)
      expect(per_call).to.be.lessThan(0.1)
    })
  })

  describe('directory search performance', () => {
    let temp_dir

    before(async () => {
      temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-benchmark-'))

      // Create a realistic directory structure
      const directories = []
      for (let i = 0; i < 100; i++) {
        directories.push(`project-${i}`)
        directories.push(`project-${i}/src`)
        directories.push(`project-${i}/tests`)
        directories.push(`project-${i}/docs`)
      }

      for (const dir of directories) {
        await fs.mkdir(path.join(temp_dir, dir), { recursive: true })
      }

      // Create some files too
      for (let i = 0; i < 50; i++) {
        await fs.writeFile(
          path.join(temp_dir, `project-${i}`, 'README.md'),
          'content'
        )
      }
    })

    after(async () => {
      try {
        await fs.rm(temp_dir, { recursive: true, force: true })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should enumerate 400+ directories in under 1 second', async () => {
      const start = performance.now()
      const results = await search_directories({
        base_directory: temp_dir,
        limit: 1000
      })
      const duration = performance.now() - start

      console.log(
        `    Found ${results.length} directories in ${duration.toFixed(2)}ms`
      )
      expect(duration).to.be.lessThan(1000)
      expect(results.length).to.be.at.least(400)
    })
  })

  describe('combined search performance', () => {
    it('should complete paths mode search under target time', async function () {
      // This test measures end-to-end performance
      // The target is under 5 seconds for typical queries
      const test_paths = []
      for (let i = 0; i < 2000; i++) {
        test_paths.push({
          file_path: `directory-${i % 100}/subdirectory/file-${i}.md`,
          type: 'file'
        })
      }

      const test_directories = []
      for (let i = 0; i < 500; i++) {
        test_directories.push({
          file_path: `directory-${i}/`,
          type: 'directory'
        })
      }

      const all_results = [...test_paths, ...test_directories]
      const query = 'directory file'

      const start = performance.now()
      const results = score_and_rank_results({
        query,
        results: all_results,
        rank_field: 'file_path',
        limit: 20
      })
      const duration = performance.now() - start

      console.log(
        `    Combined search (2500 items) took ${duration.toFixed(2)}ms`
      )
      expect(duration).to.be.lessThan(500)
      expect(results).to.have.lengthOf(20)
    })
  })

  describe('memory efficiency', () => {
    it('should not create excessive memory allocations', () => {
      const test_paths = []
      for (let i = 0; i < 10000; i++) {
        test_paths.push({
          file_path: `very/long/path/to/some/deeply/nested/directory/file-${i}.md`,
          type: 'file'
        })
      }

      const initial_memory = process.memoryUsage().heapUsed

      // Run multiple scoring operations
      for (let iteration = 0; iteration < 10; iteration++) {
        score_and_rank_results({
          query: 'nested file',
          results: test_paths,
          limit: 50
        })
      }

      const final_memory = process.memoryUsage().heapUsed
      const memory_growth_mb = (final_memory - initial_memory) / 1024 / 1024

      console.log(
        `    Memory growth after 10 iterations: ${memory_growth_mb.toFixed(2)}MB`
      )
      // Should not grow more than 50MB for these operations
      expect(memory_growth_mb).to.be.lessThan(50)
    })
  })
})
