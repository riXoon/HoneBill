import { useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';

import { en, type Messages } from './en';
import { fil } from './fil';

/**
 * The app's language: English, or Filipino (everyday Taglish: short action names such as Send, Receive and Top-up,
 * and product words such as MPIN, QR and Short ID, stay in English; everything people need to read is translated).
 *
 * Screens read text with `useT()`, which re-renders them when the language changes. Code outside React (hooks'
 * callbacks, services, formatters) reads `messages()` at the moment it builds the text.
 *
 * The choice is kept on this phone. Until one is made, a phone set to Filipino starts in Filipino. It is read
 * synchronously on first use, so the first frame is already in the right language.
 */

export type Language = 'en' | 'fil';

/** Each language named in itself, so a person who cannot read the current one still finds theirs. */
export const LANGUAGES: readonly { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
];

const KEY = 'honebill.language';
const DICTIONARIES: Record<Language, Messages> = { en, fil };

function deviceLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    return locale.startsWith('fil') || locale.startsWith('tl') ? 'fil' : 'en';
  } catch {
    return 'en';
  }
}

function savedLanguage(): Language | null {
  try {
    const value = Storage.getItemSync(KEY);
    return value === 'en' || value === 'fil' ? value : null;
  } catch {
    return null;
  }
}

let current: Language | null = null;
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  current ??= savedLanguage() ?? deviceLanguage();
  return current;
}

export function setLanguage(next: Language): void {
  if (next === getLanguage()) return;
  current = next;
  listeners.forEach((listener) => listener());
  Storage.setItemAsync(KEY, next).catch(() => {
    // Applies for this session; the phone's language is used again next launch.
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current text, for code outside React. Read it when the text is built, not once at import. */
export function messages(): Messages {
  return DICTIONARIES[getLanguage()];
}

/** The current language, re-rendering when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage);
}

/** The current text, re-rendering when the language changes. */
export function useT(): Messages {
  return DICTIONARIES[useLanguage()];
}

export type { Messages };
