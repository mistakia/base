#!/bin/bash
# Require USER_BASE_DIRECTORY to be set. All user-base shell scripts source this.
#
# Contract: USER_BASE_DIRECTORY must be set by the execution context
# (PM2, docker-compose, shell profile, or the caller).
# Scripts fail immediately if it is missing.

if [ -z "$USER_BASE_DIRECTORY" ]; then
    echo "Error: USER_BASE_DIRECTORY is not set" >&2
    exit 1
fi

THREAD_DIR="$USER_BASE_DIRECTORY/thread"
IMPORT_HISTORY_DIR="$USER_BASE_DIRECTORY/import-history"
BASE_SUBMODULE_DIR="$USER_BASE_DIRECTORY/repository/active/base"
