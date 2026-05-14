---
name: verifying-before-completion
description: Evidence-before-claims rule for ca-web. Use BEFORE declaring
  any task done, fixed, passing, shipped, working, or ready — the skill
  provides the claim-to-command table (tsc, eslint, pre-commit, app
  renders, deployment loads, PV widget right-click, 29ID build resolves)
  you must run before making the assertion. Also use proactively when you
  catch yourself about to write "should work", "looks good", or "no
  obvious issues" — those are hypotheses, not verifications, and this
  skill says how to convert them into evidence.
---

# Verifying before completion

## When to use

Before declaring any task "done", "fixed", "passing", or "shipped". The
rule: **evidence before claims**. Don't tell the user something works
because the code looks right; tell them because you ran the proof.

## The claim → command table

| Claim | Command that proves it |
|---|---|
| "Type-check passes" | `npx tsc --noEmit` exits 0 |
| "Lint clean" | `npx eslint --max-warnings 0 .` exits 0 |
| "Pre-commit passes" | `pre-commit run --all-files` exits 0 |
| "App renders" | `npm run dev`, navigate to `http://localhost:4200`, pick a deployment, confirm at least one panel renders without console errors |
| "Hooks fire from Claude Code" | edit a `.ts` file via Edit/Write, confirm Prettier reformatted it on disk and (if under `src/lib`/`src/widgets`/`src/deployments`) the doc-sync hook warned to stderr |
| "29ID build resolves" | `npx tsc --noEmit` — **not** `npm run build`; the build copies `public/ui/29id` which is an NFS-only symlink and fails on non-beamline hosts |
| "Deployment loads" | `npm run dev`, open `http://localhost:4200/?deployment=<id>`, verify the title/tabs match the `DeploymentConfig` |
| "PV widget right-clicks correctly" | open a panel, right-click any `ChanRbvBox`/`ChanSpBox`, confirm the PV info popup appears |

## Steps

1. **List the claims you're about to make.** "I fixed the bug, the build
   passes, the panel renders." That's three claims.
2. **Run each claim's command** from the table above. If a claim has no
   command, weaken it ("the code looks correct, but I haven't run it"
   instead of "it works").
3. **Quote the exit code or relevant output.** Don't paraphrase
   ("looks clean"); paste the line that proves it.
4. **If a command fails**, fix and re-run before claiming. Never claim
   based on what the code "should" do.

## Verification

- Every "done" / "fixed" / "passes" claim in your final message
  corresponds to a command you actually ran in this session.
- If asked "did you run X?", the answer is "yes" with the output.

## Anti-patterns

- "Should work" / "looks good" / "no obvious issues" — these are
  hypotheses, not verifications. Mark them as such.
- Trusting `tsc` because the editor showed no red squiggles — run the
  command.
- Skipping verification because "the change is small" — small changes
  break things too.

## See also

- [running-the-quality-gate](../running-the-quality-gate/SKILL.md) — the
  single command that exercises most of the table.
