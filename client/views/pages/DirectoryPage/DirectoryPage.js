import React from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

const DirectoryPage = ({
  directory_markdown,
  is_directory,
  is_loading_directory_markdown,
  directory_markdown_error,
  entity_data
}) => {
  const page_meta = use_page_meta({
    entity_data,
    custom_title: is_directory ? undefined : null,
    custom_description: is_directory ? undefined : null
  })

  const has_markdown_content = is_directory && directory_markdown
  const content_max_width = is_directory ? 1200 : 1400

  return (
    <>
      <PageHead
        title={page_meta.title}
        description={page_meta.description}
        tags={page_meta.tags}
        url={page_meta.url}
        image={page_meta.image}
        type={page_meta.type}
        site_name={page_meta.site_name}
        author={page_meta.author}
        published_time={page_meta.published_time}
        modified_time={page_meta.modified_time}
      />
      <PageLayout>
        <div
          style={{
            maxWidth: content_max_width,
            margin: '0 auto',
            width: '100%'
          }}>
          <div
            style={
              has_markdown_content
                ? { display: 'flex', gap: 24, alignItems: 'flex-start' }
                : undefined
            }>
            <div style={
              has_markdown_content
                ? { flex: '1 1 50%', minWidth: 0, order: 2 }
                : undefined
            }>
              <FileSystemBrowser />
            </div>
            {has_markdown_content && (
              <div style={{ flex: '1 1 50%', minWidth: 0, position: 'sticky', top: 16, order: 1 }}>
                <DirectoryMarkdown
                  directory_markdown={directory_markdown}
                  is_loading_directory_markdown={is_loading_directory_markdown}
                  directory_markdown_error={directory_markdown_error}
                />
              </div>
            )}
          </div>
        </div>
      </PageLayout>
    </>
  )
}

DirectoryPage.propTypes = {
  directory_markdown: PropTypes.string,
  is_directory: PropTypes.bool,
  is_loading_directory_markdown: PropTypes.bool,
  directory_markdown_error: PropTypes.string,
  entity_data: PropTypes.object
}

export default DirectoryPage
