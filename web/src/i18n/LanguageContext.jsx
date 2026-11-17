/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { TRANSLATIONS } from "./translations";

export const LANGUAGE_STORAGE_KEY = "cmk_lang";

const LanguageContext = createContext(null);

function getInitialLang() {
  try {
    if (typeof window !== "undefined") {
      const urlLang = new URLSearchParams(window.location.search).get("lang");
      if (urlLang === "id" || urlLang === "en") return urlLang;
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === "id" || saved === "en") return saved;
    }
  } catch {
    // ignore storage errors
  }
  return "en";
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((next) => {
    const resolved = next === "id" ? "id" : "en";
    setLangState(resolved);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "id" ? "id" : "en";
    }
  }, [lang]);

  const t = useCallback(
    (path, vars = null) => {
      const parts = String(path || "").split(".");
      let cur = TRANSLATIONS[lang] || TRANSLATIONS.en;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in cur) {
          cur = cur[p];
        } else {
          cur = undefined;
          break;
        }
      }
      if (cur === undefined) {
        let fallback = TRANSLATIONS.en;
        for (const p of parts) {
          if (fallback && typeof fallback === "object" && p in fallback) {
            fallback = fallback[p];
          } else {
            fallback = path;
            break;
          }
        }
        cur = fallback;
      }
      if (typeof cur === "string" && vars && typeof vars === "object") {
        return cur.replace(/\{(\w+)\}/g, (_, k) =>
          vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ""
        );
      }
      return cur;
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      dict: TRANSLATIONS[lang] || TRANSLATIONS.en,
    }),
    [lang, setLang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: "en",
      setLang: () => {},
      t: (path) => path,
      dict: TRANSLATIONS.en,
    };
  }
  return ctx;
}
