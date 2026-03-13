import ko from './ko'
import en from './en'
import ja from './ja'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'ko' | 'en' | 'ja'

const MESSAGES: Record<Locale, typeof ko> = { ko, en, ja }

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
}

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'ko',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'group-i18n' }
  )
)

/**
 * 번역 텍스트 조회 헬퍼.
 * 사용법: t('nav.dashboard') → '대시보드' (ko) / 'Dashboard' (en)
 */
export function useT() {
  const locale = useI18nStore((s) => s.locale)
  const messages = MESSAGES[locale] || MESSAGES.ko

  return function t(key: string): string {
    const parts = key.split('.')
    let val: unknown = messages
    for (const p of parts) {
      if (val && typeof val === 'object') {
        val = (val as Record<string, unknown>)[p]
      } else {
        return key
      }
    }
    return typeof val === 'string' ? val : key
  }
}
