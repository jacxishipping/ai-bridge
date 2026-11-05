# Dashboard language support

## Current coverage: core UI preview, not full translation

The language picker ships 20 locale choices: English, Arabic, Bengali, Simplified
and Traditional Chinese, French, German, Hebrew, Hindi, Indonesian, Japanese,
Korean, Persian, Portuguese, Russian, Spanish, Tamil, Turkish, Urdu and Vietnamese.

Translated scope: sign-in controls, live navigation, connection badges, density
controls and pagination. Operational panels, safety confirmations, API errors,
onboarding instructions and the demo remain explicitly English/LTR. Translation
copy has not received native-speaker review. This is **not** full support for every
language, and a selectable locale is not a claim of complete product coverage.

No fleet data, credentials, commands or API output are sent to a translation
service. Device/user names retain their original text; mixed-direction identity
text uses bidi isolation. Code and command output stay LTR.

## Behavior

- English is the default. A user's explicit choice is saved in
  `ai_bridge_language`, shared across tabs and restored on all routes.
- If browser storage is blocked, language changes apply to that visit and the
  picker explains that they could not be saved.
- Document `lang` and `dir` follow the locale. Arabic, Hebrew, Persian and Urdu
  use RTL shells. English fallback content has its own language/direction boundary.
- Dates and counts in the localized shell/pagination use `Intl` with the selected
  locale. Existing English operational panels may retain browser formatting.
- BCP 47 regional tags resolve to a shipped language. Chinese script and region
  distinguish Simplified/Traditional. Unknown or malformed tags fall back to
  English; the picker does not offer unavailable translations.
- Switching language does not remount sign-in fields or issue API mutations.

## Adding any further language

1. Add its BCP 47 code, English/native name and direction to
   `apps/dashboard/src/i18n/catalogs.ts`.
2. Supply its complete core message row. TypeScript enforces the row length;
   `npm run test:i18n` checks missing strings and interpolation tokens.
3. Use `useLanguage().t(...)` for translated labels, not DOM text replacement.
   Render values as React text, never translated HTML. Keep backend role/status
   identifiers, task arguments and routes language-independent.
4. Keep an explicit `lang="en" dir="ltr"` boundary around untranslated sections
   until the whole section is translated. Do not translate a destructive action
   label without its explanation, permission boundaries and confirmation.
5. Have a native speaker review terminology, especially access control, device
   revocation and emergency stops. Add plural categories using `Intl.PluralRules`
   when count-dependent prose is introduced; do not concatenate English grammar.
6. Run `npm test`, `npm run build` and `npm run test:browser`. The browser suite
   covers all shipped core locales and RTL mobile/desktop accessibility.

Full product localization requires extracting the remaining operational/demo
strings, reviewed safety terminology and additional language catalogs. Expanding
to all ISO languages is not accomplished by populating a picker with English-only
choices. External automatic translation would need a separate privacy/product
decision; it is deliberately not enabled.
