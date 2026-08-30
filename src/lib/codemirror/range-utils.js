import { RangeSet } from '@codemirror/state'

/** @import { Range, RangeValue, ChangeDesc } from '@codemirror/state' */

/**
 * @template {RangeValue} T
 * @param {Range<T>} range
 * @param {ChangeDesc} change */
export function mapRange(range, change) {
  const from = change.mapPos(range.from, 1)
  const to = change.mapPos(range.to, -1)
  return from < to ? range.value.range(from, to) : undefined
}

/**
 * @template {RangeValue} T
 * @param {Range<T>[]} ranges
 * @param {ChangeDesc} change */
export function mapRanges(ranges, change) {
  if (change.empty) return ranges
  return /** @type {typeof ranges} */ (
    ranges.map(r => mapRange(r, change))
    .filter(x => x != null))
}

/**
 * @template {RangeValue} T
 * @param {RangeSet<T>} rset
 * @param {Range<T>} r
 */
export function upsertDeco(rset, r) {
  let a = r.from
  let b = r.to
  /** @template T
   * @type {Range<T>[]} */
  const removing = []
  rset.between(r.from, r.to, (ff, tt, value) => {
    if (r.value.eq(value)) {
      let replaced = false
      if (ff < a) a = ff, replaced = true
      if (tt > b) b = tt, replaced = true
      if (replaced) {
        removing.push({from: ff, to: tt, value})
      }
    }
  })
  const rNew = r.value.range(a, b)
  removing.push(rNew)
  const removingSet = RangeSet.of(removing, true)
  return rset.update({
    filterFrom: r.from,
    filterTo: r.to,
    filter: removeExisting(removingSet, true),
    add: [rNew],
  })
}

/**
 * @template {RangeValue} T
 * @param {import('@codemirror/state').RangeSet<T>} rset
 * @returns {(from: number, to: number, value: T) => boolean}
 */
export function removeExisting(rset, checkEq = false) {
  return (from, to, value) => {
    let keep = true
    rset.between(from, to, (ff, tt, vv) => {
      if (from == ff && to == tt && (!checkEq || value.eq(vv))) {
        keep = false
        return false
      }
    })
    return keep
  }
}
