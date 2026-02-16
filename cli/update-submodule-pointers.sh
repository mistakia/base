#!/bin/bash

# Update submodule pointers for independently-synced submodules
# Records the current HEAD of thread and import-history in the parent repo
# Called by a machine-specific scheduled command (runs on one machine only)
#
# These submodules use ignore=all in .gitmodules so pointer drift does not
# appear in git status. This script periodically snapshots the current state.

set -e

source "$(dirname "$0")/lib/paths.sh"

cd "$USER_BASE_DIRECTORY"

UPDATED=false

for SUBMODULE in thread import-history; do
    if [ ! -d "$SUBMODULE/.git" ] && [ ! -f "$SUBMODULE/.git" ]; then
        echo "Submodule $SUBMODULE not initialized, skipping"
        continue
    fi

    # Check if pointer has changed
    RECORDED=$(git ls-tree HEAD "$SUBMODULE" | awk '{print $3}')
    ACTUAL=$(git -C "$SUBMODULE" rev-parse HEAD)

    if [ "$RECORDED" != "$ACTUAL" ]; then
        echo "Updating $SUBMODULE pointer: ${RECORDED:0:7} -> ${ACTUAL:0:7}"
        git add "$SUBMODULE"
        UPDATED=true
    else
        echo "$SUBMODULE pointer is current (${ACTUAL:0:7})"
    fi
done

if [ "$UPDATED" = true ]; then
    git commit -m "Update submodule pointers for thread and import-history"
    echo "Pointer update committed"
else
    echo "No pointer updates needed"
fi
