/** `foreman` namespace dictionaries (view tab label + panel strings). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'foreman'

/** The foreman dictionary key set. */
export type ForemanKey = 'view.foreman'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Foreman org-chart view tab label. */
    'foreman': ForemanKey
  }
}

/** Simplified Chinese dictionary. */
export const zh: Record<ForemanKey, string> = {
  'view.foreman': '组织架构',
}

/** English dictionary. */
export const en: Record<ForemanKey, string> = {
  'view.foreman': 'Organization',
}
