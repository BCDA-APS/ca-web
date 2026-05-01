# Bot Vault -- AI Documentation Hub

Centralized repository for AI/bot/agent/LLM-generated documentation. Exclusive location where AI agents create and modify documentation.

## Rules

### For AI agents:
- MUST write all documentation under `bot_vault/`.
- MUST NOT write in `docs/` (reserved for human-authored, user-facing docs).
- MUST NOT use emojis in any file.
- SHOULD organize technical content under `architecture/`.
- SHOULD place business/strategy in `strategy/`, regulatory/legal in `compliance/`, domain knowledge in `knowledge/`, primary research in `research/`.
- Plans go in `plans/`. Audit reports go in `audits/`.

### For humans:
- `docs/` is yours; bots leave it alone.
- `bot_vault/` is bot territory; review before merging if it matters.

## Mandatory reading before work

See [architecture/agent_workflow.md](architecture/agent_workflow.md) for what to read before any non-trivial task.

## Structure

```
bot_vault/
├── entry.md              # this file
├── README.md             # navigation hub
├── CHANGELOG.md          # version history
├── architecture/         # technical -- platform / system docs
│   ├── overview.md
│   ├── agent_workflow.md
│   └── adr/              # decision records (000-NNN)
├── plans/                # implementation plans, phased work
├── audits/               # critic reports, security/quality audits
├── research/             # primary research, spikes, prototypes
├── knowledge/            # domain knowledge, references
├── strategy/             # business / GTM / roadmap
└── compliance/           # regulatory, legal, privacy
```
