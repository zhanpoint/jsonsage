#!/usr/bin/env bash
set -Eeuo pipefail

main() {
    if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
        printf 'Only deploy <commit-sha> is allowed.\n' >&2
        exit 64
    fi
    local revision=${BASH_REMATCH[1]}
    cd "$(dirname "${BASH_SOURCE[0]}")/.."
    exec 9>.ops/deploy.lock
    flock -w 30 9
    test -z "$(git status --porcelain)" || { printf 'Server checkout has local changes.\n' >&2; exit 1; }
    git fetch --no-tags origin main
    local latest
    latest=$(git rev-parse origin/main)
    if [[ $revision != "$latest" ]]; then
        printf 'DEPLOY_SKIPPED %s superseded-by %s\n' "$revision" "$latest"
        exit 0
    fi
    git checkout main
    git merge --ff-only "$revision"
    exec /bin/bash deploy/deploy.sh "$revision"
}
main "$@"
