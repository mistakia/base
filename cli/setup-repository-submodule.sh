#!/bin/bash

# setup-repository-submodule.sh
# Add git remote repositories as submodules to repository/active or repository/archive directories

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
GITMODULES_FILE="$REPO_ROOT/.gitmodules"

# Default options
VERBOSE=false
QUIET=false
REPO_TYPE="active"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] <git-repository-url>

Add a git repository as a submodule to either repository/active or repository/archive.
The operation is idempotent - safe to run multiple times.

OPTIONS:
    -h, --help      Show this help message
    -v, --verbose   Enable verbose output
    -q, --quiet     Suppress non-error output
    -t, --type      Repository type: 'active' or 'archive' (default: active)

EXAMPLES:
    $(basename "$0") https://github.com/owner/repo
    $(basename "$0") https://bitbucket.org/acoustid/acoustid-server.git
    $(basename "$0") https://gitlab.com/group/project
    $(basename "$0") -t archive https://github.com/owner/reference-repo
    $(basename "$0") --type active git@github.com:owner/work-repo.git
    $(basename "$0") -v -t archive https://github.com/owner/awesome-project

REPOSITORY TYPES:
    active    - For repositories you have write access to (default)
    archive   - For read-only reference repositories (active=false, storage server only)

SUPPORTED GIT HOSTING SERVICES:
    GitHub, Bitbucket, GitLab, Gitea, and other git-compatible services

EOF
}

log_info() {
    if [[ "$QUIET" == false ]]; then
        echo -e "${GREEN}[INFO]${NC} $1"
    fi
}

log_warn() {
    if [[ "$QUIET" == false ]]; then
        echo -e "${YELLOW}[WARN]${NC} $1" >&2
    fi
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "[VERBOSE] $1" >&2
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -t|--type)
                if [[ -z "${2:-}" ]]; then
                    log_error "Repository type option requires a value"
                    exit 1
                fi
                REPO_TYPE="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                if [[ -z "${GIT_REPO_URL:-}" ]]; then
                    GIT_REPO_URL="$1"
                else
                    log_error "Multiple URLs provided. Only one URL is allowed."
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "${GIT_REPO_URL:-}" ]]; then
        log_error "Git repository URL is required"
        usage
        exit 1
    fi

    # Validate repository type
    if [[ "$REPO_TYPE" != "active" && "$REPO_TYPE" != "archive" ]]; then
        log_error "Invalid repository type: $REPO_TYPE"
        log_error "Valid types: active, archive"
        exit 1
    fi
}

parse_git_url() {
    local url="$1"
    local repo_name
    
    log_verbose "Parsing git repository URL: $url"
    
    # Handle SSH format: git@host:owner/repo.git
    if [[ "$url" =~ ^git@([^:]+):(.+/)?([^/]+)(\\.git)?$ ]]; then
        repo_name="${BASH_REMATCH[3]}"
        log_verbose "Detected SSH format URL"
    # Handle HTTPS format: https://host/owner/repo or https://host/owner/repo.git
    elif [[ "$url" =~ ^https://([^/]+)/(.+/)?([^/]+)(\\.git)?/?$ ]]; then
        repo_name="${BASH_REMATCH[3]}"
        log_verbose "Detected HTTPS format URL"
    # Handle git:// format: git://host/owner/repo.git
    elif [[ "$url" =~ ^git://([^/]+)/(.+/)?([^/]+)(\\.git)?/?$ ]]; then
        repo_name="${BASH_REMATCH[3]}"
        log_verbose "Detected git:// format URL"
    else
        log_error "Invalid git repository URL format: $url"
        log_error "Supported formats:"
        log_error "  - https://host/owner/repo"
        log_error "  - https://host/owner/repo.git"
        log_error "  - git@host:owner/repo.git"
        log_error "  - git://host/owner/repo.git"
        return 1
    fi
    
    # Strip .git extension if present
    repo_name="${repo_name%.git}"
    
    log_verbose "Extracted repository name: $repo_name"
    echo "$repo_name"
}

check_submodule_exists() {
    local repo_path="$1"
    local submodule_path="repository/$REPO_TYPE/$repo_path"
    local target_dir="$REPO_ROOT/repository/$REPO_TYPE/$repo_path"
    
    log_verbose "Checking if submodule already exists: $submodule_path"
    
    # Check if .gitmodules exists
    if [[ ! -f "$GITMODULES_FILE" ]]; then
        log_verbose ".gitmodules file does not exist"
        return 1
    fi
    
    # Check if the submodule path exists in .gitmodules
    if git config --file "$GITMODULES_FILE" --get "submodule.$submodule_path.path" >/dev/null 2>&1; then
        log_verbose "Submodule already exists in .gitmodules"
        return 0
    fi
    
    # Also check for the directory existence
    if [[ -d "$target_dir" ]]; then
        log_verbose "Submodule directory already exists: $target_dir"
        return 0
    fi
    
    log_verbose "Submodule does not exist"
    return 1
}

add_repository_submodule() {
    local git_repo_url="$1"
    local repo_path="$2"
    local submodule_path="repository/$REPO_TYPE/$repo_path"
    local target_dir="$REPO_ROOT/repository/$REPO_TYPE"
    
    log_verbose "Adding submodule: $submodule_path"
    log_verbose "URL: $git_repo_url"
    log_verbose "Type: $REPO_TYPE"
    
    # Ensure target directory exists
    if [[ ! -d "$target_dir" ]]; then
        log_verbose "Creating directory: $target_dir"
        mkdir -p "$target_dir"
    fi
    
    # Change to repository root for git operations
    cd "$REPO_ROOT" || {
        log_error "Failed to change to repository root: $REPO_ROOT"
        return 1
    }
    
    # Add the submodule
    log_info "Adding $REPO_TYPE submodule '$repo_path' to repository/$REPO_TYPE/"
    if git submodule add --name "$submodule_path" "$git_repo_url" "$submodule_path"; then
        log_verbose "Submodule added successfully"
    else
        log_error "Failed to add submodule"
        return 1
    fi

    # Set ignore = dirty to avoid slow git status from scanning submodule contents
    log_verbose "Setting ignore = dirty for submodule"
    git config --file "$GITMODULES_FILE" "submodule.$submodule_path.ignore" dirty

    # For archive repos, set active = false so they don't init on other machines
    if [[ "$REPO_TYPE" == "archive" ]]; then
        log_verbose "Setting active = false for archive submodule"
        git config --file "$GITMODULES_FILE" "submodule.$submodule_path.active" false
    fi

    # Initialize and update the submodule
    log_info "Initializing and updating submodule..."
    if git submodule update --init "$submodule_path"; then
        log_verbose "Submodule initialized and updated successfully"
    else
        log_error "Failed to initialize/update submodule"
        return 1
    fi
    
    log_info "Successfully added $REPO_TYPE submodule: $repo_path"
    return 0
}

validate_environment() {
    log_verbose "Validating environment and prerequisites"
    
    # Check if git is available
    if ! command -v git >/dev/null 2>&1; then
        log_error "Git is not installed or not in PATH"
        log_error "Please install git and try again"
        return 1
    fi
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        log_error "Not in a git repository"
        log_error "Please run this script from within the user-base git repository"
        return 1
    fi
    
    # Check if repository root is correct
    if [[ ! -f "$REPO_ROOT/CLAUDE.md" ]]; then
        log_error "Invalid repository root: $REPO_ROOT"
        log_error "Expected to find CLAUDE.md in repository root"
        return 1
    fi
    
    # Check if we have write permissions to repository root
    if [[ ! -w "$REPO_ROOT" ]]; then
        log_error "No write permissions to repository root: $REPO_ROOT"
        return 1
    fi
    
    log_verbose "Environment validation passed"
    return 0
}

validate_git_url() {
    local url="$1"
    
    log_verbose "Validating git repository URL format: $url"
    
    # Basic URL format validation
    if [[ -z "$url" ]]; then
        log_error "Git repository URL cannot be empty"
        return 1
    fi
    
    # Check for common invalid patterns
    if [[ "$url" =~ /tree/ ]] || [[ "$url" =~ /blob/ ]] || [[ "$url" =~ /issues/ ]] || [[ "$url" =~ /wiki/ ]] || [[ "$url" =~ /commits/ ]]; then
        log_error "URL appears to be a page link, not a repository URL"
        log_error "Please provide the main repository URL (e.g., https://host/owner/repo)"
        return 1
    fi
    
    # Basic git URL format validation
    if [[ ! "$url" =~ ^(https://|git@|git://) ]]; then
        log_error "URL must be a valid git repository URL"
        log_error "Supported protocols: https://, git@, git://"
        log_error "Provided: $url"
        return 1
    fi
    
    log_verbose "Git repository URL validation passed"
    return 0
}

main() {
    parse_args "$@"
    
    log_verbose "Starting repository submodule setup"
    log_verbose "Git repository URL: $GIT_REPO_URL"
    log_verbose "Repository type: $REPO_TYPE"
    log_verbose "Target directory: $REPO_ROOT/repository/$REPO_TYPE"
    
    # Validate environment and prerequisites
    if ! validate_environment; then
        exit 1
    fi
    
    # Validate git repository URL format
    if ! validate_git_url "$GIT_REPO_URL"; then
        exit 1
    fi
    
    # Parse the git repository URL to get repository path
    REPO_PATH=$(parse_git_url "$GIT_REPO_URL")
    if [[ $? -ne 0 ]]; then
        exit 1
    fi
    
    # Validate repository path
    if [[ -z "$REPO_PATH" ]]; then
        log_error "Failed to extract repository path from URL"
        exit 1
    fi
    
    log_info "Setting up $REPO_TYPE submodule for: $GIT_REPO_URL"
    log_info "Repository path: $REPO_PATH"
    
    # Check if submodule already exists (idempotency)
    if check_submodule_exists "$REPO_PATH"; then
        log_info "Submodule '$REPO_PATH' already exists in repository/$REPO_TYPE - skipping"
        exit 0
    fi
    
    # Add the repository submodule
    if add_repository_submodule "$GIT_REPO_URL" "$REPO_PATH"; then
        log_info "Repository submodule setup completed successfully"
    else
        log_error "Failed to set up repository submodule"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"