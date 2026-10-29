#!/usr/bin/env bash
set -Eeuo pipefail

# Exercise release failures without accessing Docker or a production checkout.
script=$(cd "$(dirname "$0")/.." && pwd)/deploy/deploy.sh
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
mkdir -p "$workspace/bin" "$workspace/.ops" "$workspace/deploy"
cp "$script" "$workspace/deploy/deploy.sh"
printf '#!/bin/sh\nexit 0\n' > "$workspace/deploy/ssh-entrypoint.sh"
cat > "$workspace/bin/git" <<'EOF'
#!/bin/sh
printf '%s\n' "$REVISION"
EOF
cat > "$workspace/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s|%s\n' "$JSONSAGE_IMAGE" "$*" >> "$CALLS"
case "$*" in
    'compose ps -q app') printf 'old-container\n' ;;
    *'{{.Config.Image}}'*) printf 'jsonsage:%s\n' "$PREVIOUS" ;;
    'image inspect '*)
        if [[ $SCENARIO == image-mismatch ]]; then printf '%s\n' "$PREVIOUS";
        else printf '%s\n' "$REVISION"; fi ;;
    *'org.opencontainers.image.revision'*) printf '%s\n' "$PREVIOUS" ;;
    'image load') [[ $SCENARIO != load-failure ]] ;;
    'image ls jsonsage '*) printf 'jsonsage:%s\njsonsage:%s\njsonsage:%s\njsonsage:latest\n' "$REVISION" "$PREVIOUS" "$OLDER" ;;
    'compose up '* )
        if [[ $APP_REVISION == "$REVISION" && $SCENARIO == start-failure ]]; then exit 1; fi
        if [[ $SCENARIO == version-failure && $APP_REVISION == "$REVISION" ]]; then
            printf '%s' "$PREVIOUS" > "$ACTIVE"
        else
            printf '%s' "$APP_REVISION" > "$ACTIVE"
        fi ;;
esac
EOF
cat > "$workspace/bin/curl" <<'EOF'
#!/bin/sh
printf '{"revision":"%s"}\n' "$(cat "$ACTIVE")"
EOF
chmod +x "$workspace/bin/"*
export PATH="$workspace/bin:$PATH"
export REVISION=1111111111111111111111111111111111111111
export PREVIOUS=2222222222222222222222222222222222222222
export OLDER=3333333333333333333333333333333333333333
export CALLS="$workspace/calls" ACTIVE="$workspace/active" SCENARIO
cd "$workspace"
run_release() {
    : > "$CALLS"
    printf '%s' "$PREVIOUS" > "$ACTIVE"
    printf 'APP_PORT=%s\nPUBLIC_HOST=localhost\n' "${1:-8088}" > .env
    bash deploy/deploy.sh "${2:-$REVISION}" > output 2>&1
}
SCENARIO=success
run_release
test "$(cat .ops/deployed-revision)" = "$REVISION"
grep -Fq "image rm jsonsage:$OLDER" "$CALLS"
if grep -Eq "image rm jsonsage:($REVISION|$PREVIOUS|latest)" "$CALLS"; then
    printf 'Cleanup removed a retained image.\n' >&2; exit 1
fi
for SCENARIO in start-failure version-failure; do
    if run_release; then printf 'A failed release reported success.\n' >&2; exit 1; fi
    test "$(cat "$ACTIVE")" = "$PREVIOUS"
    grep -Fq "jsonsage:$PREVIOUS|compose up" "$CALLS"
    if grep -q 'image rm' "$CALLS"; then printf 'Failed releases must not prune images.\n' >&2; exit 1; fi
done
for SCENARIO in load-failure image-mismatch; do
    if run_release; then exit 1; fi
    if grep -q 'compose up' "$CALLS"; then printf 'An invalid image replaced the container.\n' >&2; exit 1; fi
done
SCENARIO=success
if run_release invalid; then exit 1; fi
test ! -s "$CALLS"
if run_release 8088 "$PREVIOUS"; then exit 1; fi
test ! -s "$CALLS"
printf 'Deployment success, rollback, image isolation and revision checks passed.\n'
