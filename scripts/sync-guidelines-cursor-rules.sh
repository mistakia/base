#!/bin/bash

# Script to sync guidelines to .cursor/rules directory
# This ensures all guidelines are available as cursor rules

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURSOR_RULES_DIR="${BASE_DIR}/.cursor/rules"
SYSTEM_GUIDELINES_DIR="${BASE_DIR}/system/guideline"
DATA_GUIDELINES_DIR="${BASE_DIR}/user/guidelines"

# Ensure cursor rules directory exists
mkdir -p "${CURSOR_RULES_DIR}"

echo -e "${GREEN}Syncing guidelines to cursor rules...${NC}"

# Function to get MD5 hash compatible with both macOS and Linux
get_md5() {
    if command -v md5sum >/dev/null 2>&1; then
        # Linux
        echo "$1" | md5sum | awk '{print $1}'
    else
        # macOS
        echo "$1" | md5 -q
    fi
}

file_md5() {
    if command -v md5sum >/dev/null 2>&1; then
        # Linux
        md5sum "$1" | awk '{print $1}'
    else
        # macOS
        md5 -q "$1"
    fi
}

# Function to convert YAML frontmatter
convert_yaml() {
    local content="$1"
    local modified_content=""
    local in_frontmatter=false
    local frontmatter=""
    local body=""
    
    # Read content line by line
    while IFS= read -r line; do
        if [[ "$line" = "---" ]]; then
            if [[ "$in_frontmatter" = false ]]; then
                in_frontmatter=true
                frontmatter+="$line\n"
            else
                # End of frontmatter
                in_frontmatter=false
                
                # Process frontmatter for Cursor rule format
                local processed_frontmatter=$(echo -e "$frontmatter" | 
                    # Convert always_apply to alwaysApply
                    sed 's/always_apply:/alwaysApply:/g' | 
                    # Process globs arrays only - remove brackets and quotes
                    sed -E 's/globs: *\[(.*)\]/globs: \1/g' |
                    # Then remove all quotes around each item in the comma-separated list
                    sed -E 's/globs: *(.*)/globs: \1/g' |
                    sed -E 's/"([^"]+)"/\1/g' |
                    sed -E "s/'([^']+)'/\1/g")
                
                modified_content+="$processed_frontmatter\n$line\n"
            fi
        elif [[ "$in_frontmatter" = true ]]; then
            frontmatter+="$line\n"
        else
            modified_content+="$line\n"
        fi
    done <<< "$content"
    
    echo -e "$modified_content"
}

# Function to create/update cursor rule files
sync_guidelines() {
    local source_dir=$1
    local prefix=$2
    local changes=0
    
    if [ ! -d "$source_dir" ]; then
        echo -e "${RED}Directory not found: $source_dir${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Processing guidelines in: $source_dir (prefix: $prefix)${NC}"
    
    # Iterate through all markdown files in the source directory
    for md_file in "$source_dir"/*.md; do
        # Skip if no files match the pattern
        [ -e "$md_file" ] || continue
        
        base_name=$(basename "$md_file" .md)
        target_file="${CURSOR_RULES_DIR}/${prefix}${base_name}.mdc"
        
        # Read source file content
        source_content=$(cat "$md_file")
        
        # Convert YAML for cursor format
        cursor_content=$(convert_yaml "$source_content")
        
        # Get hash of both files to compare if an update is needed
        if [ -f "$target_file" ]; then
            target_hash=$(file_md5 "$target_file")
            source_hash=$(get_md5 "$cursor_content")
            
            if [ "$target_hash" != "$source_hash" ]; then
                echo -e "$cursor_content" > "$target_file"
                echo -e "${YELLOW}Updated: ${prefix}${base_name}.mdc${NC}"
                changes=$((changes+1))
            fi
        else
            # File doesn't exist, create it
            echo -e "$cursor_content" > "$target_file"
            echo -e "${YELLOW}Created: ${prefix}${base_name}.mdc${NC}"
            changes=$((changes+1))
        fi
    done
    
    return $changes
}

# Track guideline files to detect removed ones
find_guideline_files() {
    local system_files=$(find "$SYSTEM_GUIDELINES_DIR" -type f -name "*.md" -exec basename {} .md \; | sed 's/^/system-/' | sort)
    local data_files=$(find "$DATA_GUIDELINES_DIR" -type f -name "*.md" -exec basename {} .md \; | sed 's/^/user-/' | sort)
    echo -e "$system_files\n$data_files"
}

# Sync both guideline directories
system_changes=0
data_changes=0

sync_guidelines "$SYSTEM_GUIDELINES_DIR" "system-"
system_changes=$?

sync_guidelines "$DATA_GUIDELINES_DIR" "user-"
data_changes=$?

total_changes=$((system_changes + data_changes))

# Create a marker file with timestamp to track last sync
date > "${CURSOR_RULES_DIR}/.last-sync"

# Get list of current guidelines
current_guidelines=$(find_guideline_files)

# Summary
if [ $total_changes -eq 0 ]; then
    echo -e "${GREEN}All guidelines are already in sync.${NC}"
else
    echo -e "${YELLOW}$total_changes guideline(s) were updated.${NC}"
fi

# Check for orphaned cursor rules (guidelines that have been removed)
echo -e "${GREEN}Checking for orphaned rules...${NC}"
orphaned=0

for mdc_file in "${CURSOR_RULES_DIR}"/*.mdc; do
    # Skip if no files match the pattern
    [ -e "$mdc_file" ] || continue
    
    base_name=$(basename "$mdc_file" .mdc)
    
    # Check if this rule no longer has a corresponding guideline
    if ! echo "$current_guidelines" | grep -q "^${base_name}$"; then
        echo -e "${RED}Orphaned rule: $(basename "$mdc_file")${NC}"
        echo -e "${YELLOW}Removing orphaned rule${NC}"
        rm "$mdc_file"
        orphaned=$((orphaned+1))
    fi
done

if [ $orphaned -eq 0 ]; then
    echo -e "${GREEN}No orphaned rules found.${NC}"
else
    echo -e "${YELLOW}$orphaned orphaned rule(s) were removed.${NC}"
fi

echo -e "${GREEN}Done!${NC}" 