import React, { useState } from "react";
import { Languages } from "lucide-react";
import { GlassModal, JXButton } from "./ui";
import { languages, setLanguage, useLanguage } from "./i18n";

export function LanguageControl() {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [storageError, setStorageError] = useState(false);
  const current = languages.find(language => language.code === locale)!;
  const search = query.trim().toLocaleLowerCase(locale);
  const matches = languages.filter(language =>
    `${language.code} ${language.name} ${language.native}`.toLocaleLowerCase(locale).includes(search));
  return <span lang={locale} dir={current.dir} className="contents">
    <JXButton color="neutral" variant="outlined" aria-label={t("Language")} title={current.native}
      startIcon={<Languages className="h-4 w-4 shrink-0" aria-hidden="true" />}
      onClick={() => { setQuery(""); setOpen(true); }}>
      <bdi lang={locale} className="hidden sm:inline">{current.native}</bdi>
    </JXButton>
    {open && <GlassModal title={t("Language")} closeLabel={t("Close")} onClose={() => setOpen(false)}>
      <div className="space-y-3">
        <p lang="en" dir="ltr" className="text-xs text-slate-400">
          Navigation and sign-in translations (preview). Operational content, safety instructions and the demo remain in English. Native-speaker review is pending.
        </p>
        <label className="grid gap-1 text-sm">
          {t("Search languages")}
          <input type="search" className="product-input w-full border" value={query} autoComplete="off"
            onChange={event => setQuery(event.target.value)} />
        </label>
        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label={t("Language")}>
          {matches.map(language => <li key={language.code}>
            <button type="button" className="product-nav-link w-full justify-between"
              aria-pressed={locale === language.code} onClick={() => {
                const saved = setLanguage(language.code);
                setStorageError(!saved);
                if (saved) setOpen(false);
              }}>
              <bdi lang={language.code}>{language.native}</bdi>
              <span lang="en" dir="ltr" className="text-xs text-slate-400">{language.name}</span>
            </button>
          </li>)}
        </ul>
        {!matches.length && <p role="status" lang="en" dir="ltr" className="text-sm text-slate-400">No matching translation is available yet.</p>}
        {storageError && <p role="status" lang="en" dir="ltr" className="text-xs text-amber-300">Language changed for this visit only. Browser storage is unavailable.</p>}
        <div className="flex justify-end"><JXButton color="neutral" variant="outlined" onClick={() => setOpen(false)}>{t("Close")}</JXButton></div>
      </div>
    </GlassModal>}
  </span>;
}
