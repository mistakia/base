#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
INDEX_FILE="$BASE_DIR/file-review-index.tsv"

show_usage() {
    cat << EOF
Usage: $0 <command> [arguments]

Commands:
    add <pattern>     Add or update a file pattern with current timestamp
    check [directory] Show files changed since last review
    list             List all tracked patterns
    remove <pattern>  Remove a pattern from tracking

Examples:
    $0 add "*.env"
    $0 add "**/*.secret"
    $0 check
    $0 check ./src
    $0 list
    $0 remove "*.env"
EOF
}

ensure_index_exists() {
    if [ ! -f "$INDEX_FILE" ]; then
        touch "$INDEX_FILE"
    fi
}

add_pattern() {
    local pattern="$1"
    if [ -z "$pattern" ]; then
        echo "Error: Pattern is required" >&2
        exit 1
    fi
    
    ensure_index_exists
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Create temp file
    local temp_file=$(mktemp)
    
    # Check if pattern exists and update it, or add new
    if grep -F "	" "$INDEX_FILE" | cut -f1 | grep -Fx "$pattern" >/dev/null 2>&1; then
        # Update existing pattern - replace the line with same pattern
        awk -F'\t' -v pat="$pattern" -v ts="$timestamp" '
            $1 == pat { print pat "\t" ts; next }
            { print }
        ' "$INDEX_FILE" > "$temp_file"
        mv "$temp_file" "$INDEX_FILE"
        echo "Updated pattern: $pattern with timestamp: $timestamp"
    else
        # Add new pattern
        echo -e "${pattern}\t${timestamp}" >> "$INDEX_FILE"
        echo "Added pattern: $pattern with timestamp: $timestamp"
    fi
}

list_patterns() {
    ensure_index_exists
    
    if [ ! -s "$INDEX_FILE" ]; then
        echo "No patterns tracked"
        return
    fi
    
    echo "Tracked patterns:"
    while IFS=$'\t' read -r pattern timestamp; do
        printf "  %-30s (last reviewed: %s)\n" "$pattern" "$timestamp"
    done < "$INDEX_FILE"
}

remove_pattern() {
    local pattern="$1"
    if [ -z "$pattern" ]; then
        echo "Error: Pattern is required" >&2
        exit 1
    fi
    
    ensure_index_exists
    
    if ! cut -f1 "$INDEX_FILE" | grep -Fx "$pattern" >/dev/null 2>&1; then
        echo "Pattern not found: $pattern"
        exit 1
    fi
    
    local temp_file=$(mktemp)
    awk -F'\t' -v pat="$pattern" '$1 != pat' "$INDEX_FILE" > "$temp_file"
    mv "$temp_file" "$INDEX_FILE"
    echo "Removed pattern: $pattern"
}

check_files() {
    local check_dir="${1:-.}"
    
    ensure_index_exists
    
    if [ ! -s "$INDEX_FILE" ]; then
        echo "No patterns configured. Use '$0 add <pattern>' to add patterns."
        echo "Showing all reviewable files..."
        echo
    fi
    
    # Find all text files with comprehensive exclusions
    local temp_all_files=$(mktemp)
    find "$check_dir" -type f \
        ! -path "*/\.*" \
        ! -path "*/node_modules/*" \
        ! -path "*/.git/*" \
        ! -path "*/dist/*" \
        ! -path "*/build/*" \
        ! -path "*/coverage/*" \
        ! -path "*/vendor/*" \
        ! -path "*/__pycache__/*" \
        ! -path "*/venv/*" \
        ! -path "*/env/*" \
        ! -path "*/.next/*" \
        ! -name "*.pyc" \
        ! -name "*.pyo" \
        ! -name "*.so" \
        ! -name "*.dylib" \
        ! -name "*.dll" \
        ! -name "*.exe" \
        ! -name "*.bin" \
        ! -name "*.jpg" \
        ! -name "*.jpeg" \
        ! -name "*.png" \
        ! -name "*.gif" \
        ! -name "*.svg" \
        ! -name "*.ico" \
        ! -name "*.pdf" \
        ! -name "*.zip" \
        ! -name "*.tar" \
        ! -name "*.gz" \
        ! -name "*.rar" \
        ! -name "*.7z" \
        ! -name "*.mp3" \
        ! -name "*.mp4" \
        ! -name "*.avi" \
        ! -name "*.mov" \
        ! -name "*.wmv" \
        ! -name "*.flv" \
        ! -name "*.woff" \
        ! -name "*.woff2" \
        ! -name "*.ttf" \
        ! -name "*.eot" \
        ! -name "*.otf" \
        ! -name "*.db" \
        ! -name "*.sqlite" \
        ! -name "*.lock" \
        ! -name "package-lock.json" \
        ! -name "yarn.lock" \
        ! -name "Gemfile.lock" \
        ! -name "composer.lock" \
        | while read -r file; do
            # Check if file is text using file command
            if file "$file" 2>/dev/null | grep -qE 'text|ASCII|UTF'; then
                echo "$file"
            fi
        done | sort > "$temp_all_files"
    
    local temp_reviewed=$(mktemp)
    local temp_unreviewed=$(mktemp)
    
    # Check each file
    while IFS= read -r file; do
        # If no patterns are configured, all files need review
        if [ ! -s "$INDEX_FILE" ]; then
            echo "$file|no patterns configured" >> "$temp_unreviewed"
            continue
        fi
        
        local file_mtime=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%SZ" "$file" 2>/dev/null || \
                          stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1,2 | sed 's/ /T/; s/$/Z/')
        
        local matched=false
        local needs_review=true
        local match_reason=""
        
        # Check against each pattern
        while IFS=$'\t' read -r pattern timestamp; do
            # Check if file matches pattern (handle both full path and basename matching)
            case "$file" in
                $pattern)
                    matched=true
                    ;;
                *)
                    case "$(basename "$file")" in
                        $pattern)
                            matched=true
                            ;;
                    esac
                    ;;
            esac
            
            if [ "$matched" = true ]; then
                # Compare timestamps
                if [[ "$file_mtime" < "$timestamp" ]] || [[ "$file_mtime" == "$timestamp" ]]; then
                    needs_review=false
                    break
                else
                    match_reason="modified after $timestamp"
                fi
            fi
        done < "$INDEX_FILE"
        
        if [ "$matched" = false ]; then
            echo "$file|no matching pattern" >> "$temp_unreviewed"
        elif [ "$needs_review" = true ]; then
            echo "$file|$match_reason" >> "$temp_unreviewed"
        else
            echo "$file" >> "$temp_reviewed"
        fi
    done < "$temp_all_files"
    
    # Display results
    echo "=== Files needing review ==="
    if [ -s "$temp_unreviewed" ]; then
        local count=$(wc -l < "$temp_unreviewed" | tr -d ' ')
        echo "Found $count file(s) that need review:"
        echo
        while IFS='|' read -r file reason; do
            echo "  $file ($reason)"
        done < "$temp_unreviewed"
    else
        echo "No files need review"
    fi
    
    echo
    echo "=== Summary ==="
    local total=$(wc -l < "$temp_all_files" | tr -d ' ')
    local reviewed=$([ -s "$temp_reviewed" ] && wc -l < "$temp_reviewed" | tr -d ' ' || echo 0)
    local unreviewed=$([ -s "$temp_unreviewed" ] && wc -l < "$temp_unreviewed" | tr -d ' ' || echo 0)
    
    echo "Total files checked: $total"
    echo "Files already reviewed: $reviewed"
    echo "Files needing review: $unreviewed"
    
    # Cleanup
    rm -f "$temp_all_files" "$temp_reviewed" "$temp_unreviewed"
}

# Main command processing
case "${1:-}" in
    add)
        add_pattern "$2"
        ;;
    check)
        check_files "$2"
        ;;
    list)
        list_patterns
        ;;
    remove)
        remove_pattern "$2"
        ;;
    -h|--help|help)
        show_usage
        ;;
    *)
        echo "Error: Invalid command '${1:-}'" >&2
        echo
        show_usage
        exit 1
        ;;
esac