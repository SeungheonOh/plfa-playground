import { mapRanges } from '$lib/codemirror/range-utils'
import { StateEffect } from '@codemirror/state'
import { Decoration } from '@codemirror/view'

/** @import { Range, StateEffectType } from '@codemirror/state' */

/** @type {StateEffectType<{isToken: boolean, decos: Range<Decoration>[]}>} */
export const setHighlight = StateEffect.define({
  map: (value, ch) => {
    const decos = mapRanges(value.decos, ch)
    return decos === value.decos ? value : { ...value, decos }
  }})
/** @type {StateEffectType<Range<any>[]>} */
export const removeHighlight = StateEffect.define({map: mapRanges})
/**
 * @type {StateEffectType<boolean>}
 * true if intended to clean only tokenbased, all otherwise
 */
export const clearHighlight = StateEffect.define()

/** @type {StateEffectType<Range<Decoration>[]>} */
export const addGoals = StateEffect.define({ map: mapRanges })
/** @type {StateEffectType<Range<Decoration>[]>} */
export const setGoals = StateEffect.define({ map: mapRanges })

/** @type {StateEffectType<void>} */
export const clearRunningInfo = StateEffect.define()
/** @type {StateEffectType<{message: string, debugLevel: number}>} */
export const emitRunningInfo = StateEffect.define()
