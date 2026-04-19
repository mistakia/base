#!/usr/bin/env bash

# Integration test for auto-commit-threads.sh batch-mode deletion guard.
# Manually run (no CI wiring under repository/active/base/cli/tests/).
#
# Run:
#   bash repository/active/base/cli/tests/auto-commit-threads-metadata-guard.test.sh
#
# Asserts the invariant: in batch mode, a metadata.json deletion is only staged
# when the sibling raw-data/ and timeline.jsonl are absent.

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTO_COMMIT="$SCRIPT_DIR/../auto-commit-threads.sh"

if [ ! -f "$AUTO_COMMIT" ]; then
    echo "auto-commit-threads.sh not found at $AUTO_COMMIT" >&2
    exit 2
fi

PASS=0
FAIL=0
FAILURES=()

fail() {
    FAIL=$((FAIL + 1))
    FAILURES+=("$1")
}

pass() { PASS=$((PASS + 1)); }

TMP_ROOT=$(mktemp -d -t auto-commit-threads-guard-XXXXXX)
trap 'rm -rf "$TMP_ROOT"' EXIT

# Scaffold a thread submodule-shaped repo: a bare-minimum git repo at
# $dir whose contents mirror what auto-commit-threads.sh expects
# ($THREAD_DIR/<uuid>/metadata.json, gitignored raw-data/ and timeline.jsonl).
make_thread_repo() {
    local dir="$1"
    mkdir -p "$dir"
    git -C "$dir" init -q
    git -C "$dir" config user.email test@example.com
    git -C "$dir" config user.name Test
    git -C "$dir" config commit.gpgsign false

    cat > "$dir/.gitignore" <<'EOF'
*/raw-data/
*/timeline.jsonl
EOF
    git -C "$dir" add .gitignore
    git -C "$dir" commit -q -m "seed"
}

# Seed a single thread directory with committed metadata.json and on-disk
# bulk-data siblings (raw-data/ and timeline.jsonl).
seed_thread() {
    local repo="$1"
    local uuid="$2"
    mkdir -p "$repo/$uuid/raw-data"
    echo '{"thread_id":"'"$uuid"'"}' > "$repo/$uuid/metadata.json"
    echo '{"type":"session-start"}' > "$repo/$uuid/timeline.jsonl"
    echo '{"session":"stub"}' > "$repo/$uuid/raw-data/claude-session.jsonl"
    git -C "$repo" add "$uuid/metadata.json"
    git -C "$repo" commit -q -m "seed thread $uuid"
}

# Invoke auto-commit-threads.sh in batch mode against $repo, capturing
# stderr. USER_BASE_DIRECTORY is set so paths.sh resolves THREAD_DIR to our
# scaffold. --skip-lock avoids flock dependency; --no-sweep keeps the sweep
# (which would not touch a HEAD-tracked metadata.json) out of the picture so
# we test do_commit in isolation.
run_auto_commit() {
    local repo="$1"
    local stderr_file="$2"
    # paths.sh computes THREAD_DIR as $USER_BASE_DIRECTORY/thread; scaffold a
    # parent that points at our repo via that name.
    local parent
    parent=$(dirname "$repo")
    local wanted="$parent/thread"
    if [ "$repo" != "$wanted" ]; then
        echo "repo must be named 'thread': got $repo" >&2
        exit 2
    fi
    (
        cd "$parent"
        USER_BASE_DIRECTORY="$parent" \
            bash "$AUTO_COMMIT" --skip-lock --no-sweep
    ) >/dev/null 2>"$stderr_file"
}

# ---------------------------------------------------------------
# Test 1: Regression -- metadata.json deletion with siblings present
#         must NOT be staged, must emit the refusal warning, must not
#         create a new commit.
# ---------------------------------------------------------------
test_regression_case() {
    local root="$TMP_ROOT/t1"
    mkdir -p "$root"
    local repo="$root/thread"
    make_thread_repo "$repo"

    local uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    seed_thread "$repo" "$uuid"

    local head_before
    head_before=$(git -C "$repo" rev-parse HEAD)

    rm "$repo/$uuid/metadata.json"

    local stderr="$root/stderr.log"
    run_auto_commit "$repo" "$stderr"

    local head_after
    head_after=$(git -C "$repo" rev-parse HEAD)
    if [ "$head_before" = "$head_after" ]; then
        pass
    else
        fail "t1a: HEAD advanced when deletion should have been refused"
    fi

    # git status still shows the file as deleted (unstaged).
    local status
    status=$(git -C "$repo" status --porcelain -- "$uuid/metadata.json")
    if echo "$status" | grep -q '^ D '; then
        pass
    else
        fail "t1b: expected unstaged deletion, got: $status"
    fi

    if grep -q "refusing to stage deletion of $uuid/metadata.json: siblings present" "$stderr"; then
        pass
    else
        fail "t1c: stderr missing refusal warning; got: $(cat "$stderr")"
    fi
}

# ---------------------------------------------------------------
# Test 2: Intentional cleanup -- when raw-data/ and timeline.jsonl are
#         gone, the metadata.json deletion IS staged and committed.
# ---------------------------------------------------------------
test_intentional_cleanup_case() {
    local root="$TMP_ROOT/t2"
    mkdir -p "$root"
    local repo="$root/thread"
    make_thread_repo "$repo"

    local uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    seed_thread "$repo" "$uuid"

    local head_before
    head_before=$(git -C "$repo" rev-parse HEAD)

    rm -rf "$repo/$uuid/raw-data"
    rm -f "$repo/$uuid/timeline.jsonl"
    rm "$repo/$uuid/metadata.json"

    local stderr="$root/stderr.log"
    run_auto_commit "$repo" "$stderr"

    local head_after
    head_after=$(git -C "$repo" rev-parse HEAD)
    if [ "$head_before" != "$head_after" ]; then
        pass
    else
        fail "t2a: expected a new commit, HEAD did not advance; stderr: $(cat "$stderr")"
    fi

    local name_status
    name_status=$(git -C "$repo" log -1 --name-status --pretty=format:)
    if echo "$name_status" | grep -qE "^D[[:space:]]+$uuid/metadata.json$"; then
        pass
    else
        fail "t2b: HEAD commit missing 'D $uuid/metadata.json', got: $name_status"
    fi
}

test_regression_case
test_intentional_cleanup_case

echo
echo "passed: $PASS"
echo "failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
    printf '  - %s\n' "${FAILURES[@]}" >&2
    exit 1
fi
