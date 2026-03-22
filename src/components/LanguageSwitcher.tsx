import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe } from 'lucide-react';

const languages = [
  { code: 'hy', name: '\u0540\u0561\u0575\u0565\u0580\u0565\u0576', flag: '\uD83C\uDDE6\uD83C\uDDF2' },
  { code: 'en', name: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation('common');
  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <label className="relative inline-flex h-10 items-center gap-2 rounded-[10px] border border-input bg-background px-3 text-sm text-foreground shadow-sm">
      <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">Select language</span>
      <select
        value={currentLang.code}
        onChange={(event) => changeLanguage(event.target.value)}
        aria-label="Select language"
        className="min-w-0 cursor-pointer appearance-none bg-transparent pr-5 text-sm outline-none"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
    </label>
  );
}
