#!/usr/bin/env bash
# Moves the khe-homelab pins of both images to one commit's digests and opens
# (or updates) the auto-merging pin PR (estate ADR-008). CI's "Pin homelab"
# job runs it with the khe-adventure-pins App token in GH_TOKEN.
#
#   scripts/pin-homelab.sh <homelab-checkout> <full commit sha>
#
# DRY_RUN=1 prints the change and stops. A pin that is not on :main (a sha-
# rollback) is left alone, and then nothing moves.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <homelab-checkout> <full commit sha>" >&2
  exit 2
fi

homelab="$1"
commit="$2"
image_base=ghcr.io/khelias/khe-ai-adventure
compose=services/apps/games/docker-compose.yml
branch=deploy/khe-ai-adventure
repo="${HOMELAB_REPO:-khelias/khe-homelab}"
file="$homelab/$compose"

[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Not a full commit sha: $commit" >&2; exit 2; }
[ -f "$file" ] || { echo "No $compose in $homelab" >&2; exit 2; }

new="$(mktemp)"
trap 'rm -f "$new"' EXIT
cp "$file" "$new"

for part in proxy web; do
  image="$image_base-$part"
  pinned="$(grep -cE "^ +image: ${image//./\\.}[:@]" "$file" || true)"
  on_main="$(grep -cE "^ +image: ${image//./\\.}:main@sha256:[0-9a-f]{64}$" "$file" || true)"
  if [ "$pinned" -eq 0 ]; then
    echo "::error::$compose has no $image pin" >&2
    exit 1
  fi
  if [ "$on_main" -ne "$pinned" ]; then
    echo "::notice::$image is not pinned to :main (a rollback?); the homelab pins are left alone"
    exit 0
  fi
  digest="$(docker buildx imagetools inspect "$image:sha-$commit" --format '{{json .Manifest}}' | jq -r .digest)"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::no digest for $image:sha-$commit" >&2; exit 1; }
  sed -i.bak -E "s#^( +image: ${image//./\\.}:main@)sha256:[0-9a-f]{64}\$#\\1$digest#" "$new"
  rm -f "$new.bak"
done

if cmp -s "$file" "$new"; then
  echo "::notice::the homelab pins are already at ${commit:0:7}"
  exit 0
fi

if [ "${DRY_RUN:-}" = 1 ]; then
  diff -U0 "$file" "$new" | grep -E '^[-+] ' || true
  exit 0
fi

cp "$new" "$file"
title="Deploy khe-ai-adventure ${commit:0:7}"
run_url=""
if [ -n "${GITHUB_RUN_ID:-}" ]; then
  run_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
fi
body="Pins khe-ai-adventure-web and -proxy to commit $commit.${run_url:+ Run: $run_url}"

git -C "$homelab" checkout -B "$branch"
git -C "$homelab" add "$compose"
git -C "$homelab" commit -m "$title" -m "$body"
git -C "$homelab" push --force origin "$branch"

pr="$(gh pr list -R "$repo" --head "$branch" --state open --json number --jq '.[0].number // empty')"
if [ -z "$pr" ]; then
  gh pr create -R "$repo" --base main --head "$branch" --title "$title" --body "$body"
else
  gh api -X PATCH "repos/$repo/pulls/$pr" -f title="$title" -f body="$body" --silent
fi
gh pr merge -R "$repo" "$branch" --auto --squash
