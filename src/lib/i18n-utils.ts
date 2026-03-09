// =============================================================================
// CENTRALIZED I18N UTILITIES
// =============================================================================

import i18n from 'i18next';

/**
 * Get text based on current language (hy, ru, en)
 * Replaces duplicated getText() functions across the codebase
 */
export function getText(hy: string, ru: string, en: string): string {
  const lang = i18n.language;
  if (lang === 'hy') return hy;
  if (lang === 'ru') return ru;
  return en;
}
