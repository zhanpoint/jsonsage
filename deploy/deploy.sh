#!/usr/bin/env bash
set -Eeuo pipefail

main() {
    local revision=${1:?Missing commit SHA}
    [[ $revision =~ ^[0-9a-f]{40}$ ]] && [[ $(git rev-parse HEAD) == "$revision" ]] || {
        printf 'The requested revision does not match this checkout.\n' >&2
        return 1
    }
    export APP_REVISION=$revision JSONSAGE_IMAGE="jsonsage:$revision"
    local APP_PORT
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
    # The CI runner builds the image; never compile on the production host.
    docker image load
    local image_revision
    image_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$JSONSAGE_IMAGE")
    [[ $image_revision == "$revision" ]] || {
        printf 'The release image revision does not match the requested commit.\n' >&2
        return 1
    }

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
    # Retain the active release and its rollback image; Docker refuses to remove
    # any image still referenced by another container.
    local image
    while IFS= read -r image; do
        [[ $image =~ ^jsonsage:[0-9a-f]{40}$ ]] || continue
        [[ $image == "$JSONSAGE_IMAGE" || $image == "$previous_image" ]] && continue
        docker image rm "$image" >/dev/null || printf 'Could not remove old image %s\n' "$image" >&2
    done < <(docker image ls jsonsage --format '{{.Repository}}:{{.Tag}}')
    printf 'DEPLOYED %s\n' "$revision"
}
main "$@"
