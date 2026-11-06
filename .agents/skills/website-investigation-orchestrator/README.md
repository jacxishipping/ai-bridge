# Website Investigation Orchestrator

A Claude Code skill for comprehensive, evidence-based website UI/UX and functional audits, with optional Gemini delegation.

## What it does

- Discovers public pages and builds a page inventory.
- Inspects page layouts and reusable components.
- Tests safe, non-destructive interactions.
- Reviews responsive behavior and practical accessibility.
- Delegates bounded visual/UX analysis to Gemini when a real integration is configured.
- Tracks progress and evidence.
- Validates findings and generates a structured report.

## Important architecture note

Gemini API access is not browser automation. The skill uses available Claude Code browser/MCP tools for live navigation and interaction, then can send screenshots, DOM/accessibility snapshots, and structured evidence to Gemini for secondary analysis. If no Gemini route is configured, it produces a manual handoff bundle and continues with available tools.

## Install

### Personal installation (all projects)

Copy this folder to:

- macOS/Linux: `~/.claude/skills/website-investigation-orchestrator/`
- Windows: `%USERPROFILE%\.claude\skills\website-investigation-orchestrator\`

### Project installation (one repository)

Copy this folder to:

`<your-project>/.claude/skills/website-investigation-orchestrator/`

Restart Claude Code or start a new session so it discovers the skill.

## Use

```text
/website-investigation-orchestrator https://example.com
```

Or ask naturally:

```text
Investigate https://example.com end-to-end. Audit all public pages,
test safe interactions, inspect mobile and desktop layouts, and generate
a complete evidence-based report. Do not submit forms or make purchases.
```

## Gemini configuration

The skill automatically checks for an existing Gemini-capable MCP tool or configured agent integration. If none exists, it checks whether `GEMINI_API_KEY` is present in the environment. The API route requires network access and a supported model identifier configured by the user or confirmed from current Google documentation.

Set `GEMINI_MODEL` to a currently supported Gemini model if using the API route. Do not hardcode keys in this folder, shell history, task JSON, or reports.

The API route is used for analysis of supplied evidence. It does not give Gemini live browser control. For browser control, configure a browser-capable MCP tool in Claude Code.

## Included files

- `SKILL.md` — main Claude Code skill
- `references/communication-protocol.md` — route detection and message protocol
- `references/task-contracts.md` — delegation task types and payload schemas
- `references/evidence-and-validation.md` — evidence rules, severity, validation
- `references/report-template.md` — report structure
- `references/gemini-investigator-prompt.md` — reusable Gemini system/delegation prompt
- `schemas/audit-manifest.schema.json` — audit state schema
- `scripts/init_audit.py` — creates an audit workspace
- `scripts/validate_audit.py` — validates audit state and evidence references

## Safety

This skill is designed for authorized, non-invasive public website review. It must not bypass access controls, exploit vulnerabilities, submit real user data, or perform destructive actions.

## Documentation

Claude Code discovers filesystem-based skills from `.claude/skills/` in a project or `~/.claude/skills/` for personal use. See the official documentation:
https://code.claude.com/docs/en/skills
