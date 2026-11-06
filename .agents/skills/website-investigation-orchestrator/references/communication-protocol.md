# Agent Communication Protocol

## 1. Purpose and roles

- **Claude Code / Orchestrator:** owns scope, browser execution, evidence capture, task scheduling, reconciliation, validation, and final reporting.
- **Gemini Investigator:** provides secondary analysis of supplied evidence; it must not claim actions it did not execute.
- **Browser integration:** performs live page navigation and interaction when available.
- **User:** authorizes credentials, account access, external submissions, paid actions, or other consequential operations.

Gemini is optional. The audit must remain useful without it.

## 2. Automatic route selection

Inspect currently available MCP tools and documented integrations first. Choose the first genuinely callable route:

### Route A — Gemini-capable MCP
Use only if a discovered tool explicitly supports Gemini model/agent requests or a named Gemini agent. Read its schema and required arguments before calling it. Do not guess tool names or argument shapes.

Record:
- route: `mcp`
- tool/server identifier (non-secret)
- capability: text / image / file / agent session
- timestamp
- request/task ID
- response reference

### Route B — Gemini API
Use only if all are true:
- `GEMINI_API_KEY` exists in the process environment.
- Network access is available.
- The model identifier is explicitly configured in `GEMINI_MODEL` or verified from current official Google documentation.
- The user/project environment permits outbound API calls.

Never display the key. Never place it in command-line arguments, URLs, saved JSON, logs, or report files. Prefer an environment variable in the request header. If the available HTTP client cannot safely set headers, do not use this route.

API endpoint pattern (verify current official API docs before use):
`https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`

Use an HTTP header for authentication where supported. Do not assume this API can browse or click a website. Send image parts and textual evidence in the request. For large audits, send bounded batches rather than the entire site at once.

Do not use a guessed model name. If `GEMINI_MODEL` is absent, verify a current supported model from official Google documentation or ask the user to configure it.

### Route C — Existing configured agent endpoint/session
Use only if a real tool or environment configuration exposes the endpoint/session and its schema. Follow that integration's documented authentication and payload rules. Do not scrape browser sessions or reuse unrelated cookies.

### Route D — Manual handoff
If no automated route exists:
1. Create `tasks/gemini-handoff.md`.
2. Include the task prompt, concise site context, evidence inventory, and exact requested output.
3. Place local screenshot paths or attachment references where available.
4. Tell the user to submit the handoff to their Gemini agent and return its response.
5. Continue local audit work independently.

Never represent a prepared handoff as a completed Gemini call.

## 3. Message envelope

Every delegated task must have a unique `task_id` and use this logical envelope:

```json
{
  "protocol": "website-investigation/1.0",
  "audit_id": "audit-YYYYMMDD-shortid",
  "task_id": "visual-home-001",
  "created_at": "ISO-8601 timestamp",
  "task_type": "visual_analysis",
  "target": {
    "url": "https://example.com/",
    "page_id": "page-home",
    "scope": "homepage hero and first three sections"
  },
  "objective": "Identify evidence-backed visual hierarchy and usability findings.",
  "evidence": [
    {
      "evidence_id": "EV-001",
      "kind": "screenshot",
      "path_or_reference": "evidence/home-desktop.png",
      "viewport": "1440x900",
      "captured_at": "ISO-8601 timestamp",
      "description": "Homepage initial viewport"
    }
  ],
  "constraints": [
    "Use only supplied evidence.",
    "Do not claim interactions were tested unless the evidence records the test.",
    "Separate observations from inferences."
  ],
  "questions": [
    "Is the primary visual hierarchy clear?",
    "Are the primary and secondary calls to action distinguishable?"
  ],
  "required_output": "task_result"
}
```

The envelope is a conceptual contract. Adapt it to the actual MCP/API tool schema without inventing unsupported fields.

## 4. Response envelope

Require Gemini to return structured JSON or clearly delimited Markdown with:

```json
{
  "protocol": "website-investigation/1.0",
  "audit_id": "audit-YYYYMMDD-shortid",
  "task_id": "visual-home-001",
  "status": "completed",
  "summary": "Short synthesis.",
  "findings": [
    {
      "finding_id": "G-001",
      "claim": "The primary CTA has weak visual distinction from adjacent actions.",
      "evidence_ids": ["EV-001"],
      "evidence_class": "OBSERVED",
      "confidence": "medium",
      "impact": "Users may not identify the intended next action.",
      "recommendation": "Increase hierarchy using a consistent primary button treatment.",
      "limitations": []
    }
  ],
  "unknowns": [],
  "limitations": [],
  "follow_up_needed": []
}
```

If Gemini returns prose rather than JSON, normalize it into this shape while preserving the original response. Do not silently invent missing fields; use null/unknown.

## 5. Batching and context limits

- Delegate one page or coherent group of components per task.
- Prefer a small number of high-quality screenshots with viewport metadata over huge unstructured dumps.
- Include only relevant DOM/accessibility excerpts.
- Do not send cookies, authorization headers, API keys, private customer data, or hidden account content.
- Redact personal data and secrets before delegation.
- If evidence exceeds tool limits, split it into numbered batches and ask for per-batch results before synthesis.

## 6. Retry and failure policy

- Retry transient failures at most twice with bounded delay, if the tool supports it.
- Do not retry authorization, quota, invalid-model, or schema errors blindly.
- Record error class and a sanitized message.
- On failure, switch to the next permitted route or manual handoff.
- Avoid duplicate task submissions; use the same task ID only for an intentional retry and record attempt number.

## 7. Provenance

For every Gemini-derived finding, retain:
- task ID
- route used
- request timestamp
- response timestamp
- evidence IDs supplied
- raw response location
- validation status

Gemini commentary is not primary proof of browser behavior. The orchestrator must reconcile it with direct evidence.
