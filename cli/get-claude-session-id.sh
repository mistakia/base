#!/bin/bash

# get-claude-session-id.sh
# Two-step approach to get Claude Code session ID:
# Step 1: --generate - Generate a unique marker
# Step 2: --find <marker> - Search for the marker and return session ID

set -e

show_help() {
    cat << EOF
get-claude-session-id.sh - Get Claude Code session identifier

DESCRIPTION
    This tool identifies the current Claude Code session ID using a two-step
    marker-based approach. It works by generating a unique UUID marker that
    appears in the session's JSONL file, then searching for that marker to
    identify the correct session file.

USAGE
    $0 [OPTIONS]

OPTIONS
    --generate          Generate a unique marker in the current session
                       Outputs the marker and provides the next command to run

    --find <marker>     Find session ID by searching for the specified marker
                       Outputs the session ID if found

    -h, --help         Show this help message and exit

WORKFLOW
    1. Run '$0 --generate' to create a unique marker
    2. Copy the provided command and run it to get the session ID

EXAMPLES
    # Step 1: Generate a marker
    $0 --generate
    # Output: Generated marker: 12345678-1234-1234-1234-123456789ABC
    #         Next, run: $0 --find 12345678-1234-1234-1234-123456789ABC

    # Step 2: Find the session ID using the marker
    $0 --find 12345678-1234-1234-1234-123456789ABC
    # Output: Session ID: ecd6a669-b8d6-43a2-883b-29735332425d
    #         JSONL Path: /Users/user/.claude/projects/-Users-user-project/ecd6a669-b8d6-43a2-883b-29735332425d.jsonl

HOW IT WORKS
    Claude Code stores session data in ~/.claude/projects/ directories as JSONL
    files named with the session ID. This tool generates a unique marker that
    gets logged to the current session file, then searches all project directories
    to find which JSONL file contains the marker, revealing the session ID.

EXIT CODES
    0    Success
    1    Error (marker not found, invalid usage, etc.)

EOF
}

if [ "$1" = "--generate" ]; then
    # Step 1: Generate marker
    UNIQUE_STRING=$(uuidgen)
    echo "Generated marker: $UNIQUE_STRING"
    echo ""
    echo "Next, run: $0 --find $UNIQUE_STRING"
    
elif [ "$1" = "--find" ]; then
    # Step 2: Find session by marker
    if [ -z "$2" ]; then
        echo "ERROR: Marker required. Usage: $0 --find <marker>" >&2
        echo "Run '$0 --help' for more information." >&2
        exit 1
    fi
    
    UNIQUE_STRING="$2"
    echo "Searching for marker: $UNIQUE_STRING" >&2
    
    # Search for the marker in Claude project files
    SESSION_FILE=$(grep -rl "$UNIQUE_STRING" "$HOME/.claude/projects/" 2>/dev/null | head -1)
    
    if [ -z "$SESSION_FILE" ]; then
        echo "ERROR: Marker not found in session files." >&2
        echo "Try running '$0 --generate' again and wait a moment before searching." >&2
        exit 1
    fi
    
    # Extract session ID from filename
    SESSION_ID=$(basename "$SESSION_FILE" .jsonl)
    
    # Output the session ID and file path
    echo "Session ID: $SESSION_ID"
    echo "JSONL Path: $SESSION_FILE"
    
elif [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    
else
    echo "ERROR: Invalid option '$1'" >&2
    echo "Run '$0 --help' for usage information." >&2
    exit 1
fi