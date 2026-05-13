# Bot Vault -- AI Documentation Hub

Centralized repository for AI/bot/agent/LLM-generated documentation.
Exclusive location where AI agents create and modify documentation.

## Rules

### For AI agents:
- MUST write all bot-authored documentation under `bot_vault/`.
- MUST NOT write in `docs/` (reserved for human-authored, user-facing
  docs) unless the user gives explicit instruction.
- MUST NOT use emojis in any file.
- SHOULD organize technical content under `architecture/`.
- SHOULD add new top-level subdirs only when there are at least two
  files for them. Do not pre-create empty conventions.

### For humans:
- `docs/` is yours; bots leave it alone.
- `bot_vault/` is bot territory; review before merging if it matters.

## Mandatory reading before work

See [architecture/agent_workflow.md](architecture/agent_workflow.md) for
what to read before any non-trivial task.

## Structure

```
bot_vault/
├── entry.md              # this file
├── README.md             # navigation hub
├── CHANGELOG.md          # version history
├── architecture/
│   ├── overview.md       # stack, layout, subsystems
│   ├── agent_workflow.md # mandatory pre-work reading
│   └── adr/              # decision records (000-NNN)
└── skills/               # procedural how-to-extend-the-repo docs
    ├── README.md
    ├── running-the-quality-gate.md
    └── verifying-before-completion.md
```

Other subdirs (`plans/`, `audits/`, `research/`, `knowledge/`,
`strategy/`, `compliance/`) are conventional names — create them only
when there is actual content to file under them.
