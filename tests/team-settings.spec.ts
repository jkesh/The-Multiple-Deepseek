import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { normalizedRoster, validateRoster } from '../src/client/team-settings-state.ts'

const valid = {
  llmProvider: 'deepseek-official',
  defaultRole: 'engineer',
  members: [{ role: 'engineer', model: 'deepseek-v4-pro' }],
}

describe('team settings roster form', () => {
  it('accepts a valid roster', () => {
    expect(validateRoster(valid)).toEqual({})
  })

  it('reports duplicate roles, missing defaults, empty models, and invalid limits', () => {
    expect(validateRoster({
      llmProvider: '',
      defaultRole: 'ghost',
      members: [
        { role: 'quick', model: '', maxTokens: 0 },
        { role: ' quick ', model: 'deepseek-v4-flash' },
      ],
    })).toMatchObject({
      llmProvider: expect.any(String),
      defaultRole: expect.any(String),
      'members.0.model': expect.any(String),
      'members.0.maxTokens': expect.any(String),
      'members.1.role': expect.any(String),
    })
  })

  it('trims persisted values and removes blank optional fields', () => {
    expect(normalizedRoster({
      llmProvider: ' deepseek-official ',
      defaultRole: ' engineer ',
      members: [{ role: ' engineer ', model: ' deepseek-v4-pro ', label: ' ', provider: '', persona: ' ship it ' }],
    })).toEqual({
      llmProvider: 'deepseek-official',
      defaultRole: 'engineer',
      members: [{ role: 'engineer', model: 'deepseek-v4-pro', persona: 'ship it' }],
    })
  })
})

describe('team settings client manifest', () => {
  it('injects every DSH module required by the client bundle', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    const required = [...bundle.matchAll(/require\("(@deepseek-ai\/[^"]+)"\)/g)].map(match => match[1])
    expect(packageJson.dsh.client.inject).toEqual(expect.arrayContaining(required))
  })
})

describe('team-mode preset workbench', () => {
  it('mounts file and shell tools so team members can act on repositories', async () => {
    const preset = await readFile(new URL('../preset/team-mode/agent.cordis.yml', import.meta.url), 'utf8')
    for (const row of [
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-fs',
      '@deepseek-ai/dsh-tool-fs-search',
      '@deepseek-ai/dsh-tool-jobs',
    ]) {
      expect(preset).toContain(row)
    }
  })
})
