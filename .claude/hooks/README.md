# Claude Code hooks — Machina AI

## `guard-firebase-deploy.py` — block bare `firebase deploy`

A `PreToolUse` hook that blocks a blanket `firebase deploy` (which pushes hosting
+ every function to the active project — the wrong-project / lost-entitlement
footgun described in `SOURCE_OF_TRUTH.md` §2). Targeted deploys pass through:
`./deploy-functions.sh functions:<targets>`, `./deploy-hosting.sh`,
`firebase deploy --only firestore:rules`.

### Wiring (one-time, must be done by you)

Claude Code intentionally requires a **human** to edit `.claude/settings.json`,
because hooks execute arbitrary commands — an agent can't self-grant them. Add
this `hooks` block to `.claude/settings.json` (merge with the existing
`permissions` block; don't replace it):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-firebase-deploy.py\""
          }
        ]
      }
    ]
  }
}
```

Verify it works — this should be blocked with the guidance message:
```bash
echo '{"tool_input":{"command":"firebase deploy"}}' | python3 .claude/hooks/guard-firebase-deploy.py; echo "exit=$?"
```
Expected: the block message on stderr and `exit=2`. A targeted deploy passes:
```bash
echo '{"tool_input":{"command":"firebase deploy --only firestore:rules"}}' | python3 .claude/hooks/guard-firebase-deploy.py; echo "exit=$?"
```
Expected: no output and `exit=0`.

### Reducing permission prompts

To cut the permission prompts you hit every session, run the built-in
`/fewer-permission-prompts` skill — it scans your transcripts for the read-only
Bash/MCP calls you actually make and writes a reviewed allowlist into
`.claude/settings.json`. That's the safe, intended path (an agent self-granting a
broad allowlist is exactly what the harness blocks), so it's left for you rather
than baked in here.
