import { useSyncExternalStore } from "react";
import { languages, resolveLocale, translate, type Locale, type Message } from "./catalogs";

export { languages, type Locale, type Message } from "./catalogs";
const storageKey = "ai_bridge_language";
let locale: Locale = "en";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function applyLocale(next: Locale) {
  locale = next;
  document.documentElement.lang = next;
  document.documentElement.dir = languages.find(language => language.code === next)!.dir;
  notify();
}

/** Explicit English default; a saved choice wins on every route and refresh. */
export function initializeLanguage() {
  try { applyLocale(resolveLocale(localStorage.getItem(storageKey) || "en")); }
  catch { applyLocale("en"); }
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) applyLocale(resolveLocale(event.newValue || "en"));
  });
}

export function setLanguage(next: Locale): boolean {
  const safe = resolveLocale(next);
  applyLocale(safe);
  try { localStorage.setItem(storageKey, safe); return true; }
  catch { return false; }
}

export function formatDate(value: Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function useLanguage() {
  const current = useSyncExternalStore(
    subscribe,
    () => locale,
    () => "en" as Locale,
  );
  return {
    locale: current,
    t: (message: Message, values?: Record<string, string | number>) => translate(current, message, values),
    number: (value: number) => new Intl.NumberFormat(current).format(value),
    date: (value: Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(current, options).format(value),
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
