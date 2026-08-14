import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as ForemanInvariant from '@deepseek-ai/dsh-client-ui-foreman/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(ForemanInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply registers and disposes the foreman settings namespace', async () => {
    const { apply } = await import('../src/index.ts')
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(ctx.settings.describe().map(row => row.ns)).toContain(settingsNamespace('foreman'))
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(settingsNamespace('foreman'))
  })
})
