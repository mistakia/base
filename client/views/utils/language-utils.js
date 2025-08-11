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

export const get_file_type_from_path = (path) => {
  if (!path) return 'unknown'

  const ext = path.split('.').pop().toLowerCase()

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
    ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
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
