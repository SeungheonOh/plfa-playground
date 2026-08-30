import { StateField, StateEffect, EditorState, Prec } from '@codemirror/state'
import { EditorView, Decoration, hoverTooltip } from '@codemirror/view'
import { mapUtf8Range } from '$lib/codemirror/offsets'
import { makeDecoInvertedEffects } from '$lib/codemirror/inverted'
import { upsertDeco } from '$lib/codemirror/range-utils'
import { setHighlight, removeHighlight, clearHighlight, setGoals } from './effects'

/** @import { Range } from '@codemirror/state' */
/** @import { Tooltip } from '@codemirror/view' */

/** @import { AgdaHighlightingInfoItem } from './schema' */

// note that the hole is deliberately excluded from the list
/** @type {Readonly<Record<string, false | {name: string}>>} */
const aspectKinds = Object.freeze({
  __proto__: /** @type {any} */(null),
  'comment': false,
  'keyword': false,
  'string': false,
  'number': false,
  'symbol': false,
  'primitivetype': { name: 'Primitive type' },

  // name kinds
  'bound':         { name: 'Bound variable' },
  'generalizable': { name: 'Generalizable' },
  'inductiveconstructor':
                   { name: 'Inductive constructor' },
  'coinductiveconstructor':
                   { name: 'Coinductive constructor' },
  'datatype':      { name: 'Data type' },
  'field':         { name: 'Field' },
  'function':      { name: 'Function' },
  'module':        { name: 'Module' },
  'postulate':     { name: 'Postulate' },
  'primitive':     { name: 'Primitive' },
  'record':        { name: 'Record' },
  'argument':      { name: 'Argument' },
  'macro':         { name: 'macro' },

  'pragma': false,
  'background': false,
  'markup': false,
})

const otherAspectNames = Object.freeze({
  'error':                { name: 'Error' },
  'errorwarning':         { name: 'Error warning' },
  'dottedpattern':        { name: 'Dotted pattern' },
  'unsolvedmeta':         { name: 'Unsolved meta' },
  'unsolvedconstraint':   { name: 'Unsolved constraint' },
  'terminationproblem':   { name: 'Termination problem' },
  'positivityproblem':    { name: 'Positivity problem' },
  'deadcode':             { name: 'Deadcode' },
  'shadowingintelescope': { name: 'Shadowing in telescope' },
  'coverageproblem':      { name: 'Coverage problem' },
  'incompletepattern':    { name: 'Incomplete pattern' },
  'typechecks':           { name: 'Type checks' },
  'missingdefinition':    { name: 'Missing definition' },
  'instanceproblem':      { name: 'Instance problem' },
  'cosmeticproblem':      { name: 'Cosmetic problem' },
  'catchallclause':       { name: 'Catch-all clause' },
  'confluenceproblem':    { name: 'Confluence problem' },
})
/** @param {string} atom */
function atomDisplayName(atom) {
  if (atom === 'operator') return 'Operator'
  // only applicable when drawing via token based
  if (atom === 'hole') return 'Hole'
  const asp = aspectKinds[atom]
  if (/** @type {any} */(asp)?.name)
    return /** @type {{name: string}} */(asp).name
  if (atom in otherAspectNames)
    return /** @type {any} */(otherAspectNames)[atom].name
  return atom
}

// TODO: fix the side number; we generate it on the fly for now
const otherAspectsSideNudgingMap = new Map()

/** @param {string} atom */
function getOtherAspectsSideNudgingNumber(atom) {
  let n = otherAspectsSideNudgingMap.get(atom)
  if (n == null) {
    // this is why we use a map instead of Object.create(null)
    n = otherAspectsSideNudgingMap.size
    otherAspectsSideNudgingMap.set(atom, n)
  }
  return n
}

/**
 * @typedef {{
 *   id?: number,
 *   defId?: number,
 *   class: string,
 *   atoms: string[],
 *   meta: Omit<AgdaHighlightingInfoItem, 'atoms' | 'range'>,
 *   originalText: string,
 *   isHole?: boolean,
 * }} HighlightTokenSpec */

/**
 * @param {EditorState} state
 * @param {AgdaHighlightingInfoItem[]} specs */
export function buildHighlightEffects(state, specs) {
  /** @type {Range<Decoration>[]} */
  const aspects = []
  /** @type {Range<Decoration>[]} */
  const otherAspects = []

  outer: for (const spec of specs) {
    const { atoms, range, ...meta } = spec

    const [from, to] = mapUtf8Range(state, range[0] - 1, range[1] - 1)
    if (from >= to) continue

    /** @type {string[]} */
    const tokenKinds = []
    let isOperator = false
    let isHole = false

    // TODO: note -> diagnostics

    for (const atom of atoms) {
      if (atom === 'hole') {
        // totally ignore holes -- unless they are drawn via token based
        // FIXME: review this condition
        if (!spec.tokenBased) {
          continue outer
        }
        isHole = true
      }

      if (atom === 'operator') {
        isOperator = true
      } else if (aspectKinds[atom] != null) {
        // merge all aspects into one deco, while creating each for every otherAspect
        tokenKinds.push(atom)
      } else {
        const mark = Decoration.mark({
          class: `agda-${atom}`,
          atoms: [atom],
          meta,
          isHole,
          originalText: state.doc.sliceString(from, to),
        })

        // hack on side
        const nn = getOtherAspectsSideNudgingNumber(atom)
        mark.startSide += nn
        mark.endSide -= nn

        otherAspects.push(mark.range(from, to))
      }
    }

    if (isOperator) {
      tokenKinds.unshift('operator')
    }

    if (tokenKinds.length) {
      aspects.push(Decoration.mark({
        class: tokenKinds.map(a => `agda-${a}`).join(' '),
        atoms: tokenKinds,
        meta,
        originalText: state.doc.sliceString(from, to),
      }).range(from, to))
    }
  }

  /** @type {StateEffect<unknown>[]} */
  const effects = []
  if (aspects.length)
    effects.push(setHighlight.of({isToken: true, decos: aspects}))
  if (otherAspects.length)
    effects.push(setHighlight.of({isToken: false, decos: otherAspects}))
  return effects
}

const initialHighlightState = Object.freeze({
  decoCounter: 1,
  aspects: Decoration.none,
  otherAspects: Decoration.none,
})

export const highlightState = StateField.define({
  create(_state) {
    return initialHighlightState
  },
  update(value, tr) {
    if (!tr.changes.empty) {
      value = {
        ...value,
        aspects: value.aspects.map(tr.changes),
        otherAspects: value.otherAspects.map(tr.changes),
      }
    }

    let cnt = value.decoCounter

    for (let e of tr.effects) {
      if (e.is(setHighlight)) {
        /** @satisfies {keyof value} */
        const slotName = e.value.isToken ? 'aspects' : 'otherAspects'
        let slot = e.value.isToken ? value.aspects : value.otherAspects

        for (const r of e.value.decos) {
          if (slotName === 'aspects') {
            /** @type {HighlightTokenSpec} */(r.value.spec).id = cnt++
          }
          slot = upsertDeco(slot, r)
        }

        value = {
          ...value,
          decoCounter: cnt,
          [slotName]: slot,
        }
      } else if (e.is(removeHighlight)) {
        // TODO
        // value = cutRange(value, e.value)
      } else if (e.is(clearHighlight)) {
        const removeOnlyTokenBased = e.value
        if (removeOnlyTokenBased) {
          value = {
            ...value,
            aspects: value.aspects.update({
              filter(_f, _t, value) {
                return /** @type {HighlightTokenSpec} */(value.spec)
                  .meta.tokenBased !== 'TokenBased'
              },
            }),
          }
        } else {
          value = initialHighlightState
        }
      } else if (e.is(setGoals)) {
        // remove holes drawn by token highlighting
        value = {
          ...value,
          otherAspects: value.otherAspects.update({
            filter(_f, _t, value) {
              return value.spec.isHole !== true
            },
          }),
        }
      }
    }

    return value
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, value => value.aspects),
      EditorView.outerDecorations.from(field, value => value.otherAspects),
      makeDecoInvertedEffects(field, value => value.aspects, decos => [setHighlight.of({isToken: true, decos})]),
      makeDecoInvertedEffects(field, value => value.otherAspects, decos => [setHighlight.of({isToken: false, decos})]),
    ]
  },
})

/** @type {Parameters<typeof hoverTooltip>[0]} */
function hoverTooltipProvider(view, pos, side) {
  // a potential bug -- the offset property is dropped as long as tooltips being merged
  // are not referentally equal
  const offset = {x: 0, y: 4}
  const hlstate = view.state.field(highlightState)
  /** @type {Tooltip[]} */
  const tooltips = []
  ;[hlstate.aspects, hlstate.otherAspects].forEach(slot => {
    slot.between(pos, pos, (from, to, value) => {
      if (from == pos && side < 0 || to == pos && side > 0) return

      /** @type {{ spec: HighlightTokenSpec }} */
      const { spec } = value

      if (spec.atoms.every(a => aspectKinds[a] === false)) return
      if (slot === hlstate.aspects && view.state.doc.sliceString(from, to) != spec.originalText) return
      tooltips.push({
        pos: from,
        end: to,
        create(_view) {
          // FIXME: separate the DOM manipulation part
          const div = document.createElement('div')
          div.style = 'font-family: sans-serif; font-size: 14px; max-width: 400px; padding: 8px'

          // FIXME: injection
          div.innerHTML = spec.atoms.map(x => `<strong>${atomDisplayName(x)}</strong>`).join(' + ') + (spec.id ? ` id=${spec.id}` : '')

          if (spec.meta.note) {
            const pre = document.createElement('pre')
            pre.style = 'font-size: 12px; white-space: pre-wrap;'
            pre.textContent = spec.meta.note
            div.appendChild(pre)
          }

          return {
            dom: div,
            offset,
          }
        },
        // arrow: true,  needs some kludge to work with scrollable tooltip
      })
    })
  })
  return tooltips
}

const agdaHoverInfoBox = hoverTooltip(hoverTooltipProvider, {
  hideOnChange: true,
})

const markHoveredKeyword = EditorView.outerDecorations.from(agdaHoverInfoBox.active, tooltips => {
  if (tooltips.length) {
    // mark the most specific token
    const from = Math.max(...tooltips.map(x => x.pos))
    const to = Math.min(...tooltips.map(x => x.end ?? 1e9))
    if (from < to) {
      return Decoration.set([Decoration.mark({
        class: 'cm-agda-marks hovered-keyword',
      }).range(from, to)])
    }
  }
  return Decoration.none
})

// to freeze a clearing setHover effect for debugging
// let setHoverEffectRef
// const exts = [
//   EditorView.updateListener.of(vupd => {
//     setHoverEffectRef ??= vupd.view.plugin(agdaHoverInfoBox.extension[1]).setHover
//   }),
//   EditorState.transactionFilter.of(tr => {
//     for (const e of tr.effects) {
//       if (e.is(setHoverEffectRef)) {
//         console.log('setHover?', e.value)
//         if (e.value.length == 0)
//           tr = {...tr, effects: tr.effects.filter(x => x !== e)}
//       }
//     }
//     return tr
//   })
// ]

export function agdaHighlight() {
  return [
    highlightState,
    agdaHoverInfoBox,
    Prec.low(markHoveredKeyword),
  ]
}
