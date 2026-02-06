/**
 * Webpack plugin to generate a manifest of JavaScript bundles for server-side rendering
 *
 * This plugin creates a JSON manifest file with the webpack-generated assets
 * that the server can use to inject the correct bundles.
 */

class BundleManifestPlugin {
  constructor(options = {}) {
    this.options = {
      filename: 'bundle-manifest.json',
      ...options
    }
  }

  apply(compiler) {
    compiler.hooks.emit.tap('BundleManifestPlugin', (compilation) => {
      this.generateManifest(compilation)
    })
  }

  generateManifest(compilation) {
    try {
      // Get all JS assets from webpack compilation
      const assets = compilation.getAssets()
      const scripts = []

      // Filter for JavaScript files, maintain order
      const jsAssets = assets
        .filter((asset) => asset.name.endsWith('.js'))
        .sort((a, b) => {
          // Sort to ensure runtime loads first, main loads last
          if (a.name.includes('runtime')) return -1
          if (b.name.includes('runtime')) return 1
          if (a.name.includes('main')) return 1
          if (b.name.includes('main')) return -1
          return a.name.localeCompare(b.name)
        })

      // Convert to script paths
      jsAssets.forEach((asset) => {
        scripts.push(`/${asset.name}`)
      })

      // Create manifest content
      const manifest = {
        scripts,
        generated: new Date().toISOString(),
        version: compilation.hash || 'unknown'
      }

      // Emit the manifest file
      const manifestContent = JSON.stringify(manifest, null, 2)
      compilation.emitAsset(this.options.filename, {
        source: () => manifestContent,
        size: () => manifestContent.length
      })

      console.log(`Bundle manifest generated with ${scripts.length} scripts`)
    } catch (error) {
      console.error('BundleManifestPlugin error:', error)
      // Propagate error to webpack compilation to fail the build visibly
      compilation.errors.push(
        new Error(`BundleManifestPlugin: ${error.message}`)
      )
    }
  }
}

export default BundleManifestPlugin
