import { getConfig } from '../core/config.js';
import { i18n } from '../lib/i18n.js';
import { elem } from '../lib/helpers.esm.js';
import { AVAILABLE_LANGUAGES } from '../resources/index.js';

/** `key` uses dot notation, e.g. "names.en". */
function getLangTranslation(lang, key) {
  const resource = i18n.getResource(lang);
  if (!resource) return null;

  let current = resource.translation;
  for (const part of key.split('.')) {
    if (current == null) return null;
    current = current[part];
  }
  return typeof current === 'string' ? current : null;
}

export function LanguageSetting() {
  const config = getConfig();

  if (!config.enableLanguageSelector) {
    return;
  }

  const body = document.querySelector('#config-tools .config-body');
  const list = elem('select', { id: 'config-language', className: 'app-list' });

  if (body) {
    body.appendChild(list);
  }

  const langKeys = [...AVAILABLE_LANGUAGES].sort((a, b) => a.localeCompare(b));

  for (const langKey of langKeys) {
    list.appendChild(elem('option', { value: langKey, textContent: langKey }));
  }

  // Preload all languages then update option labels with native names
  const localizeLanguages = async () => {
    const usersLanguage = i18n.lng();
    const fallbackLang = config.languageSelectorFallbackLang ?? 'en';

    await Promise.all(langKeys.map(lang => i18n.preload(lang)));

    for (const option of list.querySelectorAll('option')) {
      const langValue = option.getAttribute('value');

      const name = getLangTranslation(langValue, 'name');
      if (!name) continue;

      let fullname = name;
      const localizedName = getLangTranslation(langValue, `names.${usersLanguage}`);
      const fallbackName = getLangTranslation(langValue, `names.${fallbackLang}`);

      if (localizedName && localizedName !== fullname) {
        fullname += ` (${localizedName})`;
      } else if (fallbackName && fallbackName !== fullname) {
        fullname += ` (${fallbackName})`;
      }

      option.textContent = fullname;
    }
  };

  list.addEventListener('change', async () => {
    await i18n.setLng(list.value);
    localizeLanguages();
  });

  list.localizeLanguages = localizeLanguages;
}
