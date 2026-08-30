/// <reference types="vitest/globals" />

import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { agdaCompletionSource } from '$lib/codemirror/completion'

function complete(source, explicit = true) {
  const state = EditorState.create({ doc: source })
  return agdaCompletionSource(
    new CompletionContext(state, state.doc.length, explicit),
  )
}

describe('Agda completion', () => {
  it('suggests names declared in the current buffer', () => {
    const result = complete('identity : Set\nidentity = Set\niden')
    expect(result.options.map((option) => option.label)).toContain('identity')
    expect(result.options.map((option) => option.label)).not.toContain('iden')
  })

  it('suggests exports from open builtin imports', () => {
    const result = complete('open import Agda.Builtin.Bool\ntr')
    expect(result.options.map((option) => option.label)).toContain('true')
  })
})
