/**
 * Webpack plugin to generate a manifest of JavaScript bundles for server-side rendering
 * 
 * This plugin extracts the script tags from HtmlWebpackPlugin output and creates
 * a JSON manifest file that the server can use to inject the correct bundles.
 */

class BundleManifestPlugin {
  constructor(options = {}) {
    this.options = {
      filename: 'bundle-manifest.json',
      ...options
    }
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('BundleManifestPlugin', (compilation) => {
      // Hook into HtmlWebpackPlugin's afterTemplateExecution hook
      if (compilation.hooks.htmlWebpackPluginAfterTemplateExecution) {
        compilation.hooks.htmlWebpackPluginAfterTemplateExecution.tap(
          'BundleManifestPlugin',
          (data) => {
            this.extractScriptTags(compilation, data)
          }
        )
      } else {
        // Fallback for newer versions of HtmlWebpackPlugin
        const HtmlWebpackPlugin = require('html-webpack-plugin')
        HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tap(
          'BundleManifestPlugin',
          (data) => {
            this.extractScriptTags(compilation, data)
          }
        )
      }
    })
  }

  extractScriptTags(compilation, data) {
    try {
      // Extract script tags from the HTML
      const html = data.html
      const scriptRegex = /<script[^>]*src="([^"]*)"[^>]*><\/script>/g
      const scripts = []
      let match

      while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1]
        // Only include local scripts (not external CDNs)
        if (src.startsWith('/') && !src.startsWith('//')) {
          scripts.push(src)
        }
      }

      // Create manifest content
      const manifest = {
        scripts,
        generated: new Date().toISOString(),
        version: compilation.hash || 'unknown'
      }

      // Emit the manifest file
      const manifestContent = JSON.stringify(manifest, null, 2)
      compilation.emitAsset(
        this.options.filename,
        {
          source: () => manifestContent,
          size: () => manifestContent.length
        }
      )

      console.log(`Bundle manifest generated with ${scripts.length} scripts`)
    } catch (error) {
      console.error('BundleManifestPlugin error:', error)
    }
  }
}

export default BundleManifestPlugin