#!/usr/bin/env bash
#
# Deploy Cloud Functions to the CORRECT Firebase project — always.
#
# Why this script exists: `firebase deploy` targets whatever project is
# "active" (set by a previous `firebase use`), which has silently sent deploys
# to the wrong project (e.g. travelistai-production). The app's Firestore,
# Functions, and Storage live in `secondbrain-app-94da2` — the live site's
# /api/* calls are routed there via web/vercel.json. Passing --project
# explicitly ignores any active-project override, so this can't happen again.
#
# Usage:
#   ./deploy-functions.sh                # deploy the analysis functions
#   ./deploy-functions.sh functions:foo  # deploy specific function(s)
#
set -euo pipefail

PROJECT="secondbrain-app-94da2"

# Default to the functions touched by the link/video pipeline. Override by
# passing your own comma-separated target(s) as the first argument.
RAW="${1:-functions:analyze_link,functions:analyze_image,functions:process_link_background}"

# Normalize: `firebase deploy --only` needs EVERY function prefixed with
# "functions:". A list like "functions:a,b,c" silently deploys ONLY "a" (b/c are
# read as unknown target types), so prefix any bare names automatically.
TARGETS=$(printf '%s' "$RAW" | awk -F, 'BEGIN{OFS=","}{for(i=1;i<=NF;i++){gsub(/^[ \t]+|[ \t]+$/,"",$i); if($i!~/^functions:/)$i="functions:"$i}; $1=$1; print}')

echo "Deploying [$TARGETS] to project: $PROJECT"
firebase deploy --only "$TARGETS" --project "$PROJECT"
