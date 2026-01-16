import { expect } from 'chai'

import { search_directories } from '#libs-server/search/directory-search.mjs'

describe('Directory Search', () => {
  // Mock file results simulating ripgrep output
  const mock_file_results = [
    { file_path: 'task/test.md', type: 'file' },
    { file_path: 'task/subtask/nested.md', type: 'file' },
    { file_path: 'workflow/test.md', type: 'file' },
    { file_path: 'nested/deep/file.md', type: 'file' },
    { file_path: 'root-file.md', type: 'file' }
  ]

  describe('search_directories', () => {
    it('should extract directories from file paths', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      expect(results).to.be.an('array')
      expect(results.length).to.be.greaterThan(0)
    })

    it('should return directories with correct structure', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      const task_dir = results.find((r) => r.file_path === 'task/')
      expect(task_dir).to.exist
      expect(task_dir.type).to.equal('directory')
    })

    it('should include trailing slash in file_path', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      results.forEach((result) => {
        expect(result.file_path).to.match(/\/$/)
      })
    })

    it('should not create double slashes in file_path', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      results.forEach((result) => {
        expect(result.file_path).not.to.match(/\/\//)
      })
    })

    it('should respect limit parameter', async () => {
      const results = await search_directories({
        file_results: mock_file_results,
        limit: 2
      })

      expect(results).to.have.lengthOf.at.most(2)
    })

    it('should find nested directories', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      const nested_dir = results.find((r) => r.file_path.includes('nested'))
      expect(nested_dir).to.exist
    })

    it('should extract all parent directories from nested paths', async () => {
      const results = await search_directories({
        file_results: [{ file_path: 'a/b/c/file.md', type: 'file' }]
      })

      const paths = results.map((r) => r.file_path)
      expect(paths).to.include('a/')
      expect(paths).to.include('a/b/')
      expect(paths).to.include('a/b/c/')
    })

    it('should handle empty file results', async () => {
      const results = await search_directories({
        file_results: []
      })

      expect(results).to.be.an('array')
      expect(results).to.have.lengthOf(0)
    })

    it('should handle null file results', async () => {
      const results = await search_directories({
        file_results: null
      })

      expect(results).to.be.an('array')
      expect(results).to.have.lengthOf(0)
    })

    it('should not include files in results', async () => {
      const results = await search_directories({
        file_results: mock_file_results
      })

      results.forEach((result) => {
        expect(result.type).to.equal('directory')
        expect(result.file_path).not.to.include('.md')
      })
    })

    it('should deduplicate directories from multiple files in same directory', async () => {
      const results = await search_directories({
        file_results: [
          { file_path: 'task/a.md', type: 'file' },
          { file_path: 'task/b.md', type: 'file' },
          { file_path: 'task/c.md', type: 'file' }
        ]
      })

      const task_dirs = results.filter((r) => r.file_path === 'task/')
      expect(task_dirs).to.have.lengthOf(1)
    })
  })
})
