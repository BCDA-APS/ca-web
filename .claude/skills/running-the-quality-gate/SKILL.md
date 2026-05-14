---
name: running-the-quality-gate
description: Run ca-web's pre-commit quality gate (tsc + ESLint + repo
  hygiene hooks). Use before committing any non-trivial change, when the
  user says "run the quality gate", "check the branch is healthy", "is
  this ready to commit", "lint and type-check this", or when a commit was
  blocked by pre-commit and they need to diagnose why. Also use after
  large refactors before claiming "passes" — see verifying-before-completion
  for the broader evidence rule.
---

# Running the quality gate

## When to use

Before committing any non-trivial change, or any time you want a single
answer to "is this branch healthy?" The gate scopes its checks to changed
files, so running it on a small change is fast.

## Steps

1. **First-time setup** (once per clone):
   ```
   pip install --user pre-commit
   pre-commit install
   ```
   This installs the git pre-commit hook driver. After this, every
   `git commit` runs the gate automatically.

2. **Run the full gate manually:**
   ```
   pre-commit run --all-files
   ```
   This invokes every hook in `.pre-commit-config.yaml` against every
   tracked file: trailing-whitespace, end-of-file-fixer, check-yaml,
   check-json, check-merge-conflict, check-added-large-files,
   detect-private-key, and the local `quality-gate` hook.
   Note: `quality-gate` runs `tsc --noEmit` against the whole project
   and ESLint only against **staged** TS/TSX files — so on
   `--all-files` only the tsc pass runs. To lint the whole repo, see
   step 4.

3. **Read the output top-down.** Each hook prints `Passed` or `Failed`.
   Stop at the first failure — fix it before the rest, since later hooks
   may depend on earlier passes.

4. **Targeted re-runs:**
   - `pre-commit run quality-gate` — local tsc + eslint only
   - `npx tsc --noEmit` — TypeScript directly (bypasses pre-commit)
   - `npx eslint --max-warnings 0 .` — ESLint directly (requires
     ESLint to be installed in `node_modules/`; ca-web does not pin it
     by default).

5. **Documented escape hatch** — if pre-commit is failing on a parallel
   agent's files (e.g. you only authored 3 of 13 modified files):
   ```
   SKIP=quality-gate git commit ...
   ```
   This is acceptable per CLAUDE.md; do not skip hooks otherwise.

6. **Conventional commits.** `.commitlintrc.json` is committed but
   not wired to a hook. The config is informational — commit messages
   must follow `feat:` / `fix:` / `docs:` / `chore:` / `refactor:` /
   `style:` / `perf:` / `test:` / `build:` / `ci:` / `revert:` types,
   subject lowercase, max 100 chars. To enforce it later, install
   `@commitlint/{cli,config-conventional}` and add a `commit-msg`
   pre-commit hook.

## Verification

- `pre-commit run --all-files` exits 0.
- No `Failed` line appears in the transcript.
- `git commit` on a small change runs the gate in under ~10 s.

## See also

- [verifying-before-completion](../verifying-before-completion/SKILL.md) —
  the "evidence before claims" rule and the table of commands per claim.
- `.pre-commit-config.yaml` — the hook definitions.
- `.claude/hooks/quality-gate.sh` — the local tsc+eslint runner.
