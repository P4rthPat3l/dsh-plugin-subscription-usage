/** The API key store at `~/.dsh/plugins/subscriptions/usage-keys.json`, owner-only. */
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { isKeyProviderId, isRecord } from './common.js'
import type { KeyProviderId } from './common.js'

export type KeyMap = Partial<Record<KeyProviderId, string>>

export const defaultKeyPath = (): string => dshHomePath('plugins', 'subscriptions', 'usage-keys.json')

export class KeyStore {
  constructor(private readonly path: string = defaultKeyPath()) {}

  async read(): Promise<KeyMap> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
      throw error
    }
    const parsed: unknown = JSON.parse(text)
    const keys: KeyMap = {}
    if (isRecord(parsed)) {
      for (const [id, value] of Object.entries(parsed)) {
        if (isKeyProviderId(id) && typeof value === 'string' && value !== '') keys[id] = value
      }
    }
    return keys
  }

  async set(id: KeyProviderId, key: string): Promise<void> {
    await this.write({ ...await this.read(), [id]: key })
  }

  async remove(id: KeyProviderId): Promise<void> {
    const { [id]: _removed, ...rest } = await this.read()
    await this.write(rest)
  }

  private async write(keys: KeyMap): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    try {
      await writeFile(tmp, JSON.stringify(keys, null, 2), { mode: 0o600 })
      await chmod(tmp, 0o600)
      await rename(tmp, this.path)
    } catch (error) {
      await rm(tmp, { force: true })
      throw error
    }
  }
}
