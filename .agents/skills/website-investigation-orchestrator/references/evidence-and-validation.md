# Evidence, Validation, and Issue Triage

## 1. Evidence record

Every material finding should reference one or more evidence records.

Recommended evidence object:

```json
{
  "evidence_id": "EV-0001",
  "kind": "screenshot | dom | accessibility_tree | interaction_log | console | network | metric | manual_note",
  "page_id": "page-home",
  "url": "https://example.com/",
  "captured_at": "2026-11-06T12:00:00Z",
  "viewport": "1440x900",
  "component": "Primary navigation",
  "action": "Opened Products dropdown",
  "expected": "Dropdown opens and exposes product links",
  "observed": "Dropdown opened; two links visible",
  "result": "pass",
  "artifact": "evidence/EV-0001.png",
  "notes": "No form submission or external state change"
}
```

Store screenshots and artifacts in the audit workspace. Use stable evidence IDs in reports. If the browser tool cannot save files, retain the tool's screenshot reference or explain the limitation.

## 2. Evidence classes

### VERIFIED
Directly confirmed by a reproducible action, captured DOM/state, reliable measurement, or authoritative tool output.

Example: click log and screenshot show the dropdown opens.

### OBSERVED
Visible in a screenshot or page content, but the behavior has not been tested.

Example: a button is visibly styled as a primary CTA, but its destination was not clicked.

### INFERRED
Reasonable interpretation, not direct proof.

Example: a dense hero may make the intended CTA harder to notice.

### UNVERIFIED
Plausible issue that requires further testing.

Example: a menu may be inaccessible to keyboard users, but no keyboard test was run.

### NOT_ACCESSIBLE
The relevant state or page could not be reached with current permissions/tools.

Example: account dashboard requires login credentials that were not supplied.

## 3. Functional test record

For each test, record:
- test ID
- page and URL
- component
- precondition
- action
- expected result
- actual result
- pass / fail / blocked / not-tested
- evidence IDs
- side effects avoided or encountered

A failed navigation is not necessarily a broken website if the destination is external, blocked by the test environment, or requires authentication. Explain the distinction.

## 4. Issue validation checklist

Before accepting an issue:
1. Is the claim specific and falsifiable?
2. Is the affected page/component identified?
3. Is there direct evidence or a clearly labeled inference?
4. Can the behavior be reproduced safely?
5. Is expected behavior justified by the UI label, standard convention, or user journey?
6. Is the issue distinct from existing issues?
7. Is severity proportional to user impact?
8. Is the proposed fix actionable and scoped?

Issue status:
- `accepted`
- `needs_confirmation`
- `rejected`
- `fixed_out_of_scope` (only if the user separately authorized a fix and it was verified)

## 5. Severity rubric

- **Critical:** essential journey is blocked, or direct evidence shows serious user harm, data loss, or severe exposure. Use sparingly.
- **High:** core feature or important journey is substantially impaired.
- **Medium:** meaningful friction, confusion, accessibility barrier, or repeated inconsistency.
- **Low:** minor defect, polish, or isolated visual inconsistency.
- **Informational:** observation or opportunity without a demonstrated defect.

Severity is not the same as confidence. Record both.

## 6. Confidence

- High: direct repeatable evidence.
- Medium: clear observation with some untested context.
- Low: inference or incomplete evidence.

## 7. Privacy and redaction

Do not retain or delegate:
- passwords
- API keys
- cookies or session tokens
- authorization headers
- personal contact information
- payment data
- private customer records

Redact such data from screenshots and DOM snippets where practical.

## 8. Evidence integrity

- Do not alter screenshots in ways that change their meaning.
- Annotated copies must preserve the original.
- Record viewport and timestamp when available.
- Keep raw tool output separate from interpretation.
- If a source changes during the audit, record the observation time.
- Do not cite a screenshot as proof of an interaction that it does not show.
