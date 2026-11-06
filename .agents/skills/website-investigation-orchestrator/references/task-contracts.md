# Delegation Task Contracts

## Common requirements

All tasks must be bounded, evidence-linked, and independently reviewable. Gemini must not browse beyond supplied evidence unless the selected integration explicitly supports browsing and the user authorized that behavior.

Required response fields:
- `task_id`
- `status`
- `summary`
- `findings[]`
- `unknowns[]`
- `limitations[]`

Each finding should contain:
- `finding_id`
- `claim`
- `evidence_ids[]`
- `evidence_class`
- `confidence`
- `impact`
- `recommendation`
- `limitations[]`

Allowed evidence classes:
- `VERIFIED` — direct test or measurement exists in the evidence.
- `OBSERVED` — visible in supplied screenshot/DOM but not functionally tested.
- `INFERRED` — interpretation based on evidence; state assumptions.
- `UNVERIFIED` — needs additional test.
- `NOT_ACCESSIBLE` — evidence could not be obtained.

## Task type: visual_analysis

Objective: analyze supplied screenshots and measured style information.

Review:
- visual hierarchy and focal point
- grid, alignment, spacing, density
- typography hierarchy and readability
- contrast and color usage (do not claim exact contrast without color values)
- image crop, quality, and placement
- consistency across supplied pages
- CTA prominence
- component consistency
- responsive differences where multiple viewports are supplied

Do not infer exact CSS, font files, or pixel measurements from a screenshot alone.

## Task type: component_review

Objective: assess a named component using screenshot, DOM, and test observations.

Return:
- component identity and page location
- visible variants and states
- observed behavior (only if test log supplied)
- usability strengths and weaknesses
- accessibility concerns visible in evidence
- suggested improvements

## Task type: journey_analysis

Objective: review a documented user journey.

Input must include ordered steps, page URLs, action descriptions, and outcomes. Identify friction, ambiguity, unnecessary steps, missing feedback, and trust concerns. Do not invent steps not in the supplied trace.

## Task type: accessibility_triage

Objective: identify likely accessibility concerns from supplied DOM/accessibility tree, screenshots, and keyboard test log.

For each finding, state whether it is confirmed or needs manual assistive-technology testing. Map WCAG 2.2 criteria only when the relationship is clear. Do not certify conformance.

## Task type: issue_review

Objective: review a candidate issue for clarity, severity, duplication, user impact, and evidence sufficiency.

Gemini may recommend severity, but the orchestrator makes the final classification after validating primary evidence.

## Task type: design_system_extraction

Objective: extract a provisional design system from multiple pages.

Return:
- observed color values only if provided by CSS/DOM or measured source
- typography family/weight/size only if inspectable
- spacing/radius/shadow tokens with source and confidence
- recurring components and variants
- inconsistent or one-off patterns

Distinguish exact tokens from screenshot estimates.

## Task type: report_review

Objective: review a draft audit report for unsupported claims, missing scope disclosure, contradictions, duplicated issues, and unclear recommendations.

The reviewer must identify:
- claims without evidence IDs
- test coverage claims not supported by progress records
- scores without methodology
- recommendations not tied to findings
- contradictions between summary and detailed findings
- omitted limitations

## Task type: synthesis

Objective: consolidate validated findings from multiple tasks.

Do not upgrade evidence classes. Do not treat multiple opinions about one screenshot as independent proof. Merge duplicates while retaining all supporting evidence IDs. Highlight disagreement and unresolved questions.
