#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root_dir = path.resolve(__dirname, '..')

// Data directory structure to be created in the submodule
const data_structure = {
  activity: {}, // Activity definitions
  guideline: {}, // Guideline definitions
  tag: {} // Tags
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

// Function to initialize data directory as a git submodule
const initialize_data_submodule = () => {
  const data_path = path.join(root_dir, 'data')

  // Check if data directory exists and is a git submodule
  const is_submodule =
    fs.existsSync(path.join(data_path, '.git')) ||
    fs.existsSync(path.join(root_dir, '.git', 'modules', 'data'))

  if (is_submodule) {
    console.log('Data directory is already a git submodule')
    return
  }

  // If data directory exists but is not a submodule
  if (fs.existsSync(data_path)) {
    console.log(
      'Data directory exists but is not a submodule, remove it and try again'
    )
    return
  }

  try {
    // Create a new git repository for data
    console.log('Initializing data directory as a git repository...')
    fs.mkdirSync(data_path, { recursive: true })

    // Initialize git repository in data directory
    execSync('git init', { cwd: data_path })
    console.log('Git repository initialized in data directory')

    // Create the directory structure in the data directory
    create_directory_structure(data_path, data_structure)

    // Write .gitignore file
    const gitignore_content = [
      '.DS_Store',
      '',
      'import-history/*',
      'threads/*',
      ''
    ].join('\n')
    fs.writeFileSync(path.join(data_path, '.gitignore'), gitignore_content)

    // Add and commit the initial structure
    execSync('git add .', { cwd: data_path })
    execSync('git commit -m "Initial data structure"', { cwd: data_path })
    console.log('Initial data structure committed')

    // Add as a submodule to the main repository
    console.log(
      'Adding data directory as a submodule to the main repository...'
    )
    execSync(`git submodule add ${data_path}`, { cwd: root_dir })
    execSync('git submodule init', { cwd: root_dir })
    console.log('Data directory added as a submodule')
  } catch (error) {
    console.log(error)
    console.error('Error initializing data submodule:', error.message)
    process.exit(1)
  }
}

// Main function
const setup_system = () => {
  console.log('Initializing data directory as a git submodule...')
  initialize_data_submodule()

  console.log('System setup complete!')
}

// Run the setup
setup_system()
