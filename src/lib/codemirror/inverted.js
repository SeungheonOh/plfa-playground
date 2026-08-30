import { invertedEffects } from '@codemirror/commands'

/** @import { Range, StateField, StateEffect } from '@codemirror/state' */
/** @import { Decoration, DecorationSet } from '@codemirror/view' */

/**
 * @template V, E
 * @param {StateField<V>} field
 * @param {(value: V) => DecorationSet} decoSetFn
 * @param {(s: Range<Decoration>[]) => StateEffect<E>[]} effectFn
 */
export function makeDecoInvertedEffects(field, decoSetFn, effectFn) {
  return invertedEffects.of(tr => {
    const ranges = decoSetFn(tr.startState.field(field))

    /** @type {Range<Decoration>[]} */
    const arr = []

    tr.changes.iterChangedRanges((chFrom, chTo) => {
      ranges.between(chFrom, chTo, (rFrom, rTo, value) => {
        const from = Math.max(chFrom, rFrom), to = Math.min(chTo, rTo)
        if (value.point || from < to)
          arr.push(value.range(from, to))
      })
    })

    if (arr.length) {
      arr.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
      return effectFn(arr)
    }

    return []
  })
}
