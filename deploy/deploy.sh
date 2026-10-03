#!/usr/bin/env bash
set -Eeuo pipefail

main() {
    local revision=${1:?Missing commit SHA}
    [[ $revision =~ ^[0-9a-f]{40}$ ]] && [[ $(git rev-parse HEAD) == "$revision" ]] || {
        printf 'The requested revision does not match this checkout.\n' >&2
        return 1
    }
    export APP_REVISION=$revision JSONSAGE_IMAGE="jsonsage:$revision"
    # Only these two non-secret runtime settings are read from the server file.
    local APP_PORT PUBLIC_HOST
    source .env
    [[ $APP_PORT =~ ^[0-9]{1,5}$ ]] && ((10#$APP_PORT > 0 && 10#$APP_PORT < 65536)) || {
        printf 'APP_PORT must be a valid TCP port.\n' >&2
        return 1
    }
    docker compose config --quiet
    local previous_image='' previous_revision='' container
    container=$(docker compose ps -q app)
    if [[ -n $container ]]; then
        previous_image=$(docker inspect --format '{{.Config.Image}}' "$container")
        previous_revision=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")
    fi
    docker compose build --pull app

    activate() {
        docker compose up -d --no-build --wait --wait-timeout 90 app || return 1
        local actual
        actual=$(curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/version.json") || return 1
        [[ $actual == "{\"revision\":\"$APP_REVISION\"}" ]] || return 1
        docker compose ps app
    }
    if ! activate; then
        docker compose logs --tail 80 app >&2 || true
        if [[ -n $previous_image ]]; then
            printf 'Restoring previous image: %s\n' "$previous_image" >&2
            export JSONSAGE_IMAGE=$previous_image APP_REVISION=$previous_revision
            activate || { printf 'Rollback failed; inspect the container logs.\n' >&2; return 1; }
        fi
        return 1
    fi
    install -m 755 deploy/ssh-entrypoint.sh .ops/ssh-entrypoint.sh
    printf '%s\n' "$revision" > .ops/deployed-revision
    printf 'DEPLOYED %s\n' "$revision"
}
main "$@"
