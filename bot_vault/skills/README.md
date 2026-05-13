# Skills

Reusable agentic procedures for working in the ca-web repo. Each skill is
a short markdown doc that any AI assistant (Claude Code, Cursor, codex,
gstack) can read to perform a recurring task the same way every time.

## Four skill ecosystems

This library is one of four skill layers an AI assistant has access to.
Each layer answers a different question; they are complementary.

| Layer | Lives at | Answers |
|---|---|---|
| **superpowers** (process meta-skills, Claude Code only) | installed via the Claude Code superpowers plugin | "How should I think about this kind of task?" |
| **gstack** (workflow tools, slash-invocable) | installed via the gstack plugin | "What command do I run to do this generic engineering thing?" |
| **project agents** (`.claude/agents/`) | `.claude/agents/` (in this repo) | "Run a project-scoped agent to do this for me." |
| **bot_vault/skills/** (this folder) | `bot_vault/skills/` (in this repo) | "Here's how this works in **this** repo." |

**Layering rule:** reach for the most specific layer first. If a project
agent exists (currently just `critic`), use it. Otherwise read the matching
`bot_vault/skills/` doc to perform the work yourself. Superpowers and
gstack are Claude Code plugins — they may not be available outside Claude
Code; treat them as nice-to-have, not required.

## How a skill differs from architecture docs

Architecture docs in `bot_vault/architecture/` describe **what** the system
looks like. Skills describe **how to extend it**. If you find yourself
writing step-by-step instructions inside an architecture doc, that content
belongs in a skill instead.

## Authoring a new skill

1. File: `bot_vault/skills/<verb-noun>.md`, kebab-case.
2. Body sections:
   - **When to use** — 1-2 sentences. What user request or signal triggers
     this.
   - **Steps** — numbered, imperative, complete. Include exact commands.
   - **Verification** — how to know it worked.
3. Keep it under ~80 lines. Long skills are runbooks in disguise.

## Active skills

- [running-the-quality-gate.md](running-the-quality-gate.md) — run
  `pre-commit` and interpret output.
- [verifying-before-completion.md](verifying-before-completion.md) —
  evidence before claims; concrete commands that prove each kind of
  "done".
