/**
 * @fileoverview Unit tests for entity scan config loader
 */

import { expect } from 'chai'

import {
  load_entity_scan_config,
  clear_entity_scan_config_cache,
  DEFAULT_CONFIG
} from '#libs-server/entity/filesystem/entity-scan-config.mjs'

describe('Entity Scan Config', () => {
  afterEach(() => {
    clear_entity_scan_config_cache()
  })

  describe('DEFAULT_CONFIG', () => {
    it('should have empty exclude_path_patterns by default', () => {
      expect(DEFAULT_CONFIG.exclude_path_patterns).to.be.an('array')
      expect(DEFAULT_CONFIG.exclude_path_patterns).to.have.lengthOf(0)
    })
  })

  describe('load_entity_scan_config', () => {
    it('should return config object with exclude_path_patterns', async () => {
      const config = await load_entity_scan_config()
      expect(config).to.have.property('exclude_path_patterns')
      expect(config.exclude_path_patterns).to.be.an('array')
    })

    it('should cache config across calls', async () => {
      const config1 = await load_entity_scan_config()
      const config2 = await load_entity_scan_config()
      expect(config1).to.equal(config2)
    })

    it('should return defaults when no user base directory', async () => {
      const config = await load_entity_scan_config()
      expect(config.exclude_path_patterns).to.deep.equal(
        DEFAULT_CONFIG.exclude_path_patterns
      )
    })
  })
})
