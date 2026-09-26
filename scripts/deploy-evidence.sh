#!/usr/bin/env bash
# The PAS-OPS-005 / PAS-OPS-020 deployment evidence bundle for one deployed commit, read from the
# GitHub Actions runs of that commit. Needs `gh` signed in with read access to the repo.
#
#   scripts/deploy-evidence.sh            # origin/main
#   scripts/deploy-evidence.sh <sha>
#
# Items only the owner can read (schema-status, the live build SHA in app.logs, the human checklist)
# are printed as "manual" - see VERIFICATION.md.
set -euo pipefail
repo=proappstore-online/leads
sha=$(git rev-parse "${1:-origin/main}")

run_of() { gh run list --repo "$repo" --commit "$sha" --workflow "$1" --json databaseId,url,conclusion --jq '.[0] // empty'; }
# Every job log of a run, without the runner's timestamps.
logs_of() {
  for job in $(gh api "repos/$repo/actions/runs/$1/jobs" --jq '.jobs[].id'); do
    # A skipped job has no log.
    gh api "repos/$repo/actions/jobs/$job/logs" 2>/dev/null | sed -E 's/^[0-9T:.-]+Z //' || true
  done
}
line() { grep -m1 -E "$1" <<<"$2" || echo "(not found)"; }

echo "Deploy under audit: $sha"
for wf in CI "Platform Compliance" "Deploy to R2"; do
  r=$(run_of "$wf")
  if [ -z "$r" ]; then echo "- $wf: no run for this commit"; continue; fi
  echo "- $wf: $(jq -r '.conclusion + " " + .url' <<<"$r")"
  log=$(logs_of "$(jq -r .databaseId <<<"$r")")
  case "$wf" in
    CI)
      echo "    pas check: $(line 'hard checks' "$log" | sed -E 's/\x1b\[[0-9;]*m//g')" ;;
    "Deploy to R2")
      echo "    $(line '^Applied migration' "$log")"
      echo "    $(line '^Registered [0-9]+ app tool' "$log")"
      echo "    $(line '^Deployed apps/' "$log")"
      echo "    session: $(line '^Signed-in smoke: enabled|^##\[warning\]No e2e session' "$log" | sed 's/^##\[warning\]//')"
      echo "    e2e: $(grep -E '^ +[0-9]+ (passed|failed|skipped|flaky)' <<<"$log" | tr -s ' ' | paste -sd, - || echo '(no e2e job output)')" ;;
  esac
done
echo "- gh secret list: $(gh secret list --repo "$repo" --json name --jq '[.[].name] | join(", ")')"
echo "- schema-status: manual (owner: schema_status MCP tool or the console)"
echo "- live build.sha: manual (owner: GET /v1/apps/leads/logs - entries should carry $sha)"
echo "- last human checklist: see VERIFICATION.md"
