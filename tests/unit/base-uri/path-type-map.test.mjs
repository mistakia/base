import { expect } from 'chai'
import path from 'path'

import {
  register_base_directories,
  clear_registered_directories,
  get_expected_type_for_path,
  DIRECTORY_TYPE_MAP
} from '#libs-server/base-uri/index.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'

describe('get_expected_type_for_path', () => {
  let test_system_dir, test_user_dir

  beforeEach(async () => {
    clear_registered_directories()
    test_system_dir = await create_temp_test_directory('path-type-system')
    test_user_dir = await create_temp_test_directory('path-type-user')
    register_base_directories({
      system_base_directory: test_system_dir.path,
      user_base_directory: test_user_dir.path
    })
  })

  afterEach(() => {
    clear_registered_directories()
    if (test_system_dir?.cleanup) test_system_dir.cleanup()
    if (test_user_dir?.cleanup) test_user_dir.cleanup()
  })

  it('returns the expected type for mapped user-base directories', () => {
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'workflow', 'foo.md')
      })
    ).to.equal('workflow')
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'task', 'bar.md')
      })
    ).to.equal('task')
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'guideline', 'baz.md')
      })
    ).to.equal('guideline')
  })

  it('returns null for unmapped directories', () => {
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'data', 'foo.csv')
      })
    ).to.be.null
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'config', 'bar.json')
      })
    ).to.be.null
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_user_dir.path, 'database', 'x.db')
      })
    ).to.be.null
  })

  it('matches by the first path segment for nested paths', () => {
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(
          test_user_dir.path,
          'task',
          'finance',
          'nested.md'
        )
      })
    ).to.equal('task')
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(
          test_user_dir.path,
          'workflow',
          'subdir',
          'deep.md'
        )
      })
    ).to.equal('workflow')
  })

  it('resolves paths inside the system base directory', () => {
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_system_dir.path, 'workflow', 'sys.md')
      })
    ).to.equal('workflow')
    expect(
      get_expected_type_for_path({
        absolute_path: path.join(test_system_dir.path, 'schema', 'task.md')
      })
    ).to.equal('schema')
  })

  it('returns null for paths outside both registered roots', () => {
    expect(
      get_expected_type_for_path({
        absolute_path: '/tmp/unrelated/workflow/foo.md'
      })
    ).to.be.null
  })

  it('returns null for missing or invalid input', () => {
    expect(get_expected_type_for_path({ absolute_path: '' })).to.be.null
    expect(get_expected_type_for_path({ absolute_path: null })).to.be.null
  })

  it('exposes a frozen DIRECTORY_TYPE_MAP', () => {
    expect(Object.isFrozen(DIRECTORY_TYPE_MAP)).to.be.true
    expect(DIRECTORY_TYPE_MAP.workflow).to.equal('workflow')
    expect(DIRECTORY_TYPE_MAP.task).to.equal('task')
  })
})
