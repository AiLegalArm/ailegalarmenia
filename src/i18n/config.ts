import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import Armenian translations
import hyCommon from './locales/hy/common.json';
import hyAuth from './locales/hy/auth.json';
import hyCases from './locales/hy/cases.json';
import hyAi from './locales/hy/ai.json';
import hyKb from './locales/hy/kb.json';
import hyOcr from './locales/hy/ocr.json';
import hyAudio from './locales/hy/audio.json';
import hyUsage from './locales/hy/usage.json';
import hyDashboard from './locales/hy/dashboard.json';
import hyDisclaimer from './locales/hy/disclaimer.json';
import hyErrors from './locales/hy/errors.json';
import hyCalendar from './locales/hy/calendar.json';
import hyReminders from './locales/hy/reminders.json';
import hyAdmin from './locales/hy/admin.json';
import hyDictionary from './locales/hy/dictionary.json';

// Import English translations
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enCases from './locales/en/cases.json';
import enAi from './locales/en/ai.json';
import enKb from './locales/en/kb.json';
import enOcr from './locales/en/ocr.json';
import enAudio from './locales/en/audio.json';
import enUsage from './locales/en/usage.json';
import enDashboard from './locales/en/dashboard.json';
import enDisclaimer from './locales/en/disclaimer.json';
import enErrors from './locales/en/errors.json';
import enCalendar from './locales/en/calendar.json';
import enReminders from './locales/en/reminders.json';
import enAdmin from './locales/en/admin.json';
import enDictionary from './locales/en/dictionary.json';

// Import Russian translations
import ruCommon from './locales/ru/common.json';
import ruAuth from './locales/ru/auth.json';
import ruCases from './locales/ru/cases.json';
import ruAi from './locales/ru/ai.json';
import ruKb from './locales/ru/kb.json';
import ruOcr from './locales/ru/ocr.json';
import ruAudio from './locales/ru/audio.json';
import ruUsage from './locales/ru/usage.json';
import ruDashboard from './locales/ru/dashboard.json';
import ruDisclaimer from './locales/ru/disclaimer.json';
import ruErrors from './locales/ru/errors.json';
import ruCalendar from './locales/ru/calendar.json';
import ruReminders from './locales/ru/reminders.json';
import ruAdmin from './locales/ru/admin.json';
import ruDictionary from './locales/ru/dictionary.json';

const resources = {
  hy: {
    common: hyCommon,
    auth: hyAuth,
    cases: hyCases,
    ai: hyAi,
    kb: hyKb,
    ocr: hyOcr,
    audio: hyAudio,
    usage: hyUsage,
    dashboard: hyDashboard,
    disclaimer: hyDisclaimer,
    errors: hyErrors,
    calendar: hyCalendar,
    reminders: hyReminders,
    admin: hyAdmin,
    dictionary: hyDictionary,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    cases: enCases,
    ai: enAi,
    kb: enKb,
    ocr: enOcr,
    audio: enAudio,
    usage: enUsage,
    dashboard: enDashboard,
    disclaimer: enDisclaimer,
    errors: enErrors,
    calendar: enCalendar,
    reminders: enReminders,
    admin: enAdmin,
    dictionary: enDictionary,
  },
  ru: {
    common: ruCommon,
    auth: ruAuth,
    cases: ruCases,
    ai: ruAi,
    kb: ruKb,
    ocr: ruOcr,
    audio: ruAudio,
    usage: ruUsage,
    dashboard: ruDashboard,
    disclaimer: ruDisclaimer,
    errors: ruErrors,
    calendar: ruCalendar,
    reminders: ruReminders,
    admin: ruAdmin,
    dictionary: ruDictionary,
  },
};

// Detect browser language, prefer Armenian
const getBrowserLanguage = (): string => {
  const browserLang = navigator.language.split('-')[0];
  // If browser is set to Armenian or any unsupported language, default to Armenian
  if (browserLang === 'hy' || !['en', 'hy', 'ru'].includes(browserLang)) {
    return 'hy';
  }
  return browserLang;
};

// Get saved language or detect from browser
const getSavedLanguage = (): string => {
  const saved = localStorage.getItem('i18nextLng');
  if (saved && ['hy', 'en', 'ru'].includes(saved)) {
    return saved;
  }
  return getBrowserLanguage();
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'auth', 'cases', 'ai', 'kb', 'ocr', 'audio', 'usage', 'dashboard', 'disclaimer', 'errors', 'calendar', 'reminders', 'admin', 'dictionary'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });

// Save language preference when changed
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18nextLng', lng);
  document.documentElement.lang = lng;
  // Set text direction (Armenian is LTR)
  document.documentElement.dir = 'ltr';
});

// Set initial document language
document.documentElement.lang = i18n.language;

export default i18n;
