import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslations from "../locales/en/translation.json";

// Extract translation keys for TS inference
export type TranslationKeys = keyof typeof enTranslations;

// English only for now: the Hindi strings (locales/hi-IN) are kept on disk but not
// loaded, and there is no language picker. A choice saved by the old picker is cleared
// so nobody is left on a language the app no longer offers.
try {
  localStorage.removeItem("backline_locale");
} catch {
  /* storage unavailable - nothing to clear */
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
  });

export default i18n;
