/**
 * Get normalized language from a file path
 * @param {string} file_path - Full file path or filename
 * @returns {string} Normalized language identifier for syntax highlighting
 */
export const get_language_from_path = (file_path) => {
  if (!file_path) return 'text'
  const file_name = file_path.split('/').pop() || 'file'
  const extension = file_name.includes('.') ? file_name.split('.').pop() : ''
  return normalize_language(extension) || 'text'
}

export const normalize_language = (language) => {
  if (!language) return 'text'
  const lang = language.toLowerCase()

  switch (lang) {
    // JavaScript/TypeScript variants
    case 'mjs':
    case 'cjs':
    case 'js':
    case 'javascript':
      return 'javascript'
    case 'ts':
    case 'typescript':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'tsx':
      return 'tsx'
    case 'jsx':
      return 'jsx'

    // Data formats
    case 'json':
    case 'jsonl':
      return 'json'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'toml':
      return 'toml'
    case 'xml':
      return 'xml'
    case 'csv':
      return 'csv'
    case 'sql':
      return 'sql'

    // Documentation
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'mdx':
      return 'mdx'
    case 'rst':
      return 'rst'
    case 'org':
      return 'org'
    case 'txt':
    case 'text':
    case 'plain':
      return 'text'

    // Python
    case 'py':
    case 'python':
    case 'pyi':
    case 'pyx':
      return 'python'
    case 'ipynb':
      return 'jupyter'

    // Shell scripts
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ksh':
      return 'bash'
    case 'fish':
      return 'fish'
    case 'csh':
    case 'tcsh':
      return 'tcsh'
    case 'ps1':
    case 'powershell':
      return 'powershell'
    case 'bat':
    case 'cmd':
      return 'batch'

    // Web technologies
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
      return 'css'
    case 'scss':
    case 'sass':
      return 'scss'
    case 'less':
      return 'less'
    case 'styl':
    case 'stylus':
      return 'stylus'

    // C/C++ family
    case 'c':
      return 'c'
    case 'h':
      return 'c'
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c++':
      return 'cpp'
    case 'hpp':
    case 'hh':
    case 'hxx':
    case 'h++':
      return 'cpp'

    // Other languages
    case 'rs':
    case 'rust':
      return 'rust'
    case 'go':
    case 'golang':
      return 'go'
    case 'java':
      return 'java'
    case 'cs':
    case 'csharp':
      return 'csharp'
    case 'swift':
      return 'swift'
    case 'r':
      return 'r'
    case 'php':
      return 'php'
    case 'rb':
    case 'ruby':
      return 'ruby'
    case 'kt':
    case 'kotlin':
      return 'kotlin'
    case 'scala':
      return 'scala'
    case 'lua':
      return 'lua'
    case 'perl':
    case 'pl':
      return 'perl'

    // Qt/QML
    case 'qml':
      return 'qml'

    // Configuration files
    case 'dockerfile':
      return 'dockerfile'
    case 'dockerignore':
    case 'gitignore':
    case 'gitattributes':
    case 'gitmodules':
    case 'npmignore':
    case 'eslintignore':
    case 'prettierignore':
      return 'ignore'
    case 'gitconfig':
    case 'editorconfig':
    case 'eslintrc':
    case 'prettierrc':
    case 'babelrc':
    case 'jshintrc':
    case 'npmrc':
    case 'nvmrc':
    case 'yarnrc':
      return 'ini'

    // Other formats
    case 'proto':
    case 'protobuf':
      return 'proto'
    case 'graphql':
    case 'gql':
      return 'graphql'
    case 'wasm':
    case 'wat':
      return 'wasm'
    case 'makefile':
    case 'mk':
      return 'makefile'
    case 'cmake':
      return 'cmake'
    case 'gradle':
      return 'gradle'
    case 'properties':
      return 'properties'
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'config':
      return 'ini'
    case 'log':
      return 'log'
    case 'diff':
    case 'patch':
      return 'diff'

    // Fallback to the original extension
    default:
      return lang
  }
}

export const detect_shell_script_from_content = (content) => {
  if (!content) return null

  // Check for shebang line
  const first_line = content.split('\n')[0]
  if (!first_line.startsWith('#!')) return null

  // Common shell interpreters
  if (first_line.includes('/bash') || first_line.includes('/sh')) return 'bash'
  if (first_line.includes('/zsh')) return 'zsh'
  if (first_line.includes('/fish')) return 'fish'
  if (first_line.includes('/ksh')) return 'ksh'
  if (first_line.includes('/csh') || first_line.includes('/tcsh')) return 'tcsh'
  if (first_line.includes('/python')) return 'python'
  if (first_line.includes('/perl')) return 'perl'
  if (first_line.includes('/ruby')) return 'ruby'
  if (first_line.includes('/node') || first_line.includes('/nodejs'))
    return 'javascript'

  // Default to bash for generic shell shebangs
  if (first_line.includes('/env')) {
    const parts = first_line.split(/\s+/)
    if (parts.length > 2) {
      const interpreter = parts[2].toLowerCase()
      if (interpreter === 'bash' || interpreter === 'sh') return 'bash'
      if (interpreter === 'zsh') return 'zsh'
      if (interpreter === 'fish') return 'fish'
      if (interpreter === 'python' || interpreter === 'python3') return 'python'
      if (interpreter === 'ruby') return 'ruby'
      if (interpreter === 'perl') return 'perl'
      if (interpreter === 'node') return 'javascript'
    }
  }

  // Default to bash for unrecognized shell scripts
  return 'bash'
}

export const get_file_type_from_path = (path) => {
  if (!path) return 'unknown'

  // Check if the path has an extension
  const last_segment = path.split('/').pop()
  const parts = last_segment.split('.')

  // If there's no extension (single part), return unknown to check content later
  // Also handle hidden files like .gitignore, .bashrc where parts[0] is empty
  if (parts.length === 1 || (parts[0] === '' && parts.length === 2)) {
    return 'unknown'
  }

  const ext = parts.pop().toLowerCase()

  // Code files
  const code_extensions = [
    // JavaScript/TypeScript
    'js',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'jsx',

    // Data formats
    'json',
    'jsonl',
    'yaml',
    'yml',
    'toml',
    'xml',
    'csv',
    'sql',

    // Python
    'py',
    'pyi',
    'pyx',
    'ipynb',

    // Shell scripts
    'sh',
    'bash',
    'zsh',
    'ksh',
    'fish',
    'csh',
    'tcsh',
    'ps1',
    'bat',
    'cmd',

    // Web technologies
    'html',
    'htm',
    'css',
    'scss',
    'sass',
    'less',
    'styl',

    // C/C++
    'c',
    'h',
    'cpp',
    'cc',
    'cxx',
    'hpp',
    'hh',
    'hxx',

    // Other languages
    'rs',
    'go',
    'java',
    'cs',
    'swift',
    'r',
    'php',
    'rb',
    'kt',
    'scala',
    'lua',
    'pl',

    // Qt/QML
    'qml',

    // Configuration
    'dockerfile',
    'makefile',
    'cmake',
    'gradle',
    'ini',
    'cfg',
    'conf',
    'config',
    'properties',

    // Other formats
    'proto',
    'graphql',
    'gql',
    'wasm',
    'wat',
    'diff',
    'patch'
  ]

  if (code_extensions.includes(ext)) {
    return 'code'
  }

  // Markdown files
  if (['md', 'markdown', 'mdx'].includes(ext)) {
    return 'markdown'
  }

  // Plain text files
  if (['txt', 'text', 'log', 'rst', 'org'].includes(ext)) {
    return 'text'
  }

  // Image files
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'tif'].includes(ext)
  ) {
    return 'image'
  }

  // Binary files
  if (
    [
      'exe',
      'bin',
      'dll',
      'so',
      'dylib',
      'app',
      'deb',
      'rpm',
      'msi',
      'dmg'
    ].includes(ext)
  ) {
    return 'binary'
  }

  // Archive files
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) {
    return 'archive'
  }

  return 'text'
}
