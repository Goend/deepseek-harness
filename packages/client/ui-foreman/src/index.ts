/** Host loader entry: register the Foreman connection settings namespace. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { FOREMAN_SETTINGS_NAMESPACE, type ForemanSettings } from './foreman-settings.ts'

const ForemanSettingsSchema: z<ForemanSettings> = z.object({
  foremanUrl: z.string().default('http://127.0.0.1:8787/rpc'),
  token: z.string().role('secret').default(''),
})

/** Register the Foreman connection section when a settings provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(FOREMAN_SETTINGS_NAMESPACE), ForemanSettingsSchema)
  })
}
