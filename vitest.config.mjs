import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/multiple-deepseek.spec.ts', 'tests/loader-composition.spec.ts', 'tests/team-settings.spec.ts'],
  },
})
