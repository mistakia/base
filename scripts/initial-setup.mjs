#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Data directory structure to be created in the user repository
const data_structure = {
  workflow: {},
  guideline: {},
  tag: {}
}

// Function to create directory structure recursively
const create_directory_structure = (base_path, structure) => {
  for (const [dir_name, sub_dirs] of Object.entries(structure)) {
    const dir_path = path.join(base_path, dir_name)

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir_path)) {
      console.log(`Creating directory: ${dir_path}`)
      fs.mkdirSync(dir_path, { recursive: true })

      // Add a .gitkeep file to ensure empty directories are tracked by Git
      fs.writeFileSync(path.join(dir_path, '.gitkeep'), '')
    } else {
      console.log(`Directory already exists: ${dir_path}`)
    }

    // Create subdirectories
    if (Object.keys(sub_dirs).length > 0) {
      create_directory_structure(dir_path, sub_dirs)
    }
  }
}

// Function to initialize user data directory as a separate git repository
const initialize_user_repository = (user_data_path) => {
  // Check if user data directory exists and is a git repository
  const is_git_repo = fs.existsSync(path.join(user_data_path, '.git'))

  if (is_git_repo) {
    console.log('User data directory is already a git repository')
    return
  }

  // If user data directory exists but is not a git repository
  if (fs.existsSync(user_data_path)) {
    console.log(
      'User data directory exists but is not a git repository. Please initialize it manually or remove it and try again.'
    )
    return
  }

  try {
    // Create a new git repository for user data
    console.log('Initializing user data directory as a git repository...')
    fs.mkdirSync(user_data_path, { recursive: true })

    // Initialize git repository in user data directory
    execSync('git init', { cwd: user_data_path })
    console.log('Git repository initialized in user data directory')

    // Create the directory structure in the user data directory
    create_directory_structure(user_data_path, data_structure)

    // Write .gitignore file
    const gitignore_content = [
      '.DS_Store',
      '',
      'import-history/*',
      'threads/*',
      ''
    ].join('\n')
    fs.writeFileSync(path.join(user_data_path, '.gitignore'), gitignore_content)

    // Add and commit the initial structure
    execSync('git add .', { cwd: user_data_path })
    execSync('git commit -m "Initial user data structure"', {
      cwd: user_data_path
    })
    console.log('Initial user data structure committed')

    console.log('User data directory initialized as a separate git repository')
    console.log(
      `Configure config.user_base_directory to point to: ${user_data_path}`
    )
  } catch (error) {
    console.log(error)
    console.error('Error initializing user data repository:', error.message)
    process.exit(1)
  }
}

// Main function
const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 --user-base-directory <path>')
    .option('user-base-directory', {
      alias: 'u',
      type: 'string',
      description: 'Path where the user data repository should be created',
      demandOption: true
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'Force initialization even if directory exists',
      default: false
    })
    .example(
      '$0 --user-base-directory /path/to/user-data',
      'Initialize user repository at specified path'
    )
    .example(
      '$0 -u ../user-data',
      'Initialize user repository in parent directory'
    )
    .help()
    .alias('help', 'h').argv

  const user_data_path = path.resolve(argv.userBaseDirectory)

  console.log('Setting up user data repository...')
  console.log(`Target path: ${user_data_path}`)

  // Check if force flag is needed
  if (fs.existsSync(user_data_path) && !argv.force) {
    console.error(`Error: Directory ${user_data_path} already exists.`)
    console.error('Use --force to proceed anyway, or choose a different path.')
    process.exit(1)
  }

  let error
  try {
    initialize_user_repository(user_data_path)
    console.log('\n✓ System setup complete!')
    console.log(
      `Remember to configure config.user_base_directory to: ${user_data_path}`
    )
  } catch (err) {
    error = err
    console.error('Setup failed:', error.message)
  }

  process.exit(error ? 1 : 0)
}

// Run the setup
main()
