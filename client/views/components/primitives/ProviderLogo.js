import React from 'react'
import PropTypes from 'prop-types'

import {
  AnthropicLogo,
  CursorLogo,
  OpenAILogo,
  BaseLogo
} from './logos/index.js'

const LOGO_MAP = {
  anthropic: AnthropicLogo,
  claude: AnthropicLogo, // Claude uses Anthropic logo
  cursor: CursorLogo,
  openai: OpenAILogo,
  base: BaseLogo
}

const ProviderLogo = ({
  provider,
  size = 20,
  className = '',
  decorative = false,
  ...props
}) => {
  const LogoComponent = LOGO_MAP[provider?.toLowerCase()]

  if (!LogoComponent) {
    return null
  }

  return (
    <LogoComponent
      size={size}
      className={className}
      aria-label={decorative ? undefined : `${provider} logo`}
      aria-hidden={decorative}
      role={decorative ? undefined : 'img'}
      {...props}
    />
  )
}

ProviderLogo.propTypes = {
  provider: PropTypes.string.isRequired,
  size: PropTypes.number,
  className: PropTypes.string,
  decorative: PropTypes.bool
}

export default ProviderLogo
