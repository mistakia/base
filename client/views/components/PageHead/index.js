import React from 'react'
import { Helmet } from 'react-helmet'
import PropTypes from 'prop-types'
import { COLOR_BREADCRUMB_BAR_BG } from '@theme/colors.js'

/**
 * PageHead component for dynamic meta tag management using React Helmet
 * Provides comprehensive meta tag coverage including Open Graph and Twitter Cards
 */
const PageHead = ({
  title,
  description,
  tags = [],
  url,
  image,
  type = 'website',
  site_name = 'Base',
  twitter_card = 'summary_large_image',
  author,
  published_time,
  modified_time,
  defer = false
}) => {
  // Construct full title with site name if not already included
  const full_title =
    title && !title.includes(site_name)
      ? `${title} - ${site_name}`
      : title || `${site_name} - Human-in-the-Loop System`

  // Default description fallback
  const meta_description =
    description || 'Agentic knowledge base management and execution system'

  // Keywords from tags
  const keywords = Array.isArray(tags) ? tags.join(', ') : ''

  return (
    <Helmet defer={defer}>
      {/* Basic Meta Tags */}
      <title>{full_title}</title>
      <meta name='description' content={meta_description} />
      {keywords && <meta name='keywords' content={keywords} />}
      {author && <meta name='author' content={author} />}

      {/* Canonical URL */}
      {url && <link rel='canonical' href={url} />}

      {/* Open Graph Meta Tags */}
      <meta property='og:type' content={type} />
      <meta property='og:title' content={title || full_title} />
      <meta property='og:description' content={meta_description} />
      <meta property='og:site_name' content={site_name} />
      {url && <meta property='og:url' content={url} />}
      {image && <meta property='og:image' content={image} />}
      {image && (
        <meta
          property='og:image:alt'
          content={title || 'Base system content'}
        />
      )}
      {published_time && (
        <meta property='article:published_time' content={published_time} />
      )}
      {modified_time && (
        <meta property='article:modified_time' content={modified_time} />
      )}
      {tags.length > 0 &&
        tags.map((tag) => (
          <meta key={tag} property='article:tag' content={tag} />
        ))}

      {/* Twitter Card Meta Tags */}
      <meta name='twitter:card' content={twitter_card} />
      <meta name='twitter:title' content={title || full_title} />
      <meta name='twitter:description' content={meta_description} />
      {image && <meta name='twitter:image' content={image} />}
      {image && (
        <meta
          name='twitter:image:alt'
          content={title || 'Base system content'}
        />
      )}

      {/* Additional Meta Tags for Rich Snippets */}
      <meta name='robots' content='index, follow' />
      <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />

      {/* iOS Status Bar and Theme Color - matches breadcrumb bar background */}
      <meta name='apple-mobile-web-app-capable' content='yes' />
      <meta
        name='apple-mobile-web-app-status-bar-style'
        content='black-translucent'
      />
      <meta name='theme-color' content={COLOR_BREADCRUMB_BAR_BG} />

      {/* Structured Data for Articles */}
      {type === 'article' && (
        <script type='application/ld+json'>
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: title || full_title,
            description: meta_description,
            url,
            image,
            author: {
              '@type': 'Organization',
              name: author || site_name
            },
            publisher: {
              '@type': 'Organization',
              name: site_name
            },
            datePublished: published_time,
            dateModified: modified_time || published_time,
            keywords
          })}
        </script>
      )}
    </Helmet>
  )
}

PageHead.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  tags: PropTypes.arrayOf(PropTypes.string),
  url: PropTypes.string,
  image: PropTypes.string,
  type: PropTypes.oneOf(['website', 'article']),
  site_name: PropTypes.string,
  twitter_card: PropTypes.oneOf(['summary', 'summary_large_image']),
  author: PropTypes.string,
  published_time: PropTypes.string,
  modified_time: PropTypes.string,
  defer: PropTypes.bool
}

export default PageHead
