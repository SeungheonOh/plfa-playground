import { StateField, StateEffect, ChangeSet, EditorState, Text, MapMode } from '@codemirror/state'

/** @import { StateEffectType, Transaction } from '@codemirror/state' */

/** @type {StateEffectType<void>} */
export const commit = StateEffect.define()

/** @param {string} s */
export function countSurrogates(s) {
  const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g
  let n = 0
  while (regex.exec(s)) n++
  return n
}

/** @param {{utf8len: number}[]} lines */
function textLengthUTF8(lines) {
  let sum = -1
  for (const line of lines) {
    sum += line.utf8len + 1
  }
  return sum
}

class StringV {
  /**
   * @param {number} len
   * @param {number} count */
  constructor(len, count) {
    if (!Number.isSafeInteger(len) ||
        !Number.isSafeInteger(count) ||
        count * 2 > len) {
      throw new Error('Invalid StringV construction')
    }
    this.len = len
    this.utf8len = len - count
    Object.freeze(this)
  }
  get length() { return this.len }
  toString() { return ' '.repeat(this.len) }
  /**
   * @param {number} [x]
   * @param {number} [y] */
  slice(x, y) {
    // XXX: may be faster if we compute the sliced length first
    return this.toString().slice(x, y)
  }

  static internThreshold = 128
  /** @type {StringV[]} */
  static interned = new Array(this.internThreshold)
  static {
    for (let i = 0; i < this.internThreshold; i++) {
      this.interned[i] = new StringV(i, 0)
    }
  }

  /**
   * @param {number} len
   * @param {number} count */
  static of(len, count) {
    if (count === 0 && StringV.interned[len]) {
      return StringV.interned[len]
    }
    return new StringV(len, count)
  }
}

/**
 * @template T
 * @type {new<T> (text: T[], length?: number) =>
 *        Omit<Text, 'children'> & { children: null, text: T[] }} */
const TextLeaf = /** @type {any} */ (Text.empty.constructor)
/**
 * @template [T = string]
 * @typedef {InstanceType<typeof TextLeaf<T extends string ? T : never>>} TextLeaf<T = string> */

/**
 * @template T
 * @type {new<T> (children: T[], length?: number) =>
 *        Omit<Text, 'children'> & { children: Text[] } } */
const TextNode = /** @type {any} */ (Text.of(new Array(33).fill('')).constructor)
/**
 * @template {Text} [T = Text]
 * @typedef {InstanceType<typeof TextNode<T>>} TextNode<T> */

class LineUTF8 {
  /**
   * @param {number} from
   * @param {number} to
   * @param {number} number */
  constructor(from, to, number) {
    this.from = from
    this.to = to
    this.number = number
    this.isUtf8 = true
  }
}

/**
 * @callback LineUtf8InnerFn
 * @param {number} target
 * @param {boolean} isLine
 * @param {number} line
 * @param {number} offset
 * @returns {LineUTF8} */

class TextLeafV extends TextLeaf {
  /**
   * @param {StringV[]} text
   * @param {?number} length
   * @param {number} utf8len */
  constructor(text, length, utf8len = textLengthUTF8(text)) {
    length == null ? super(text) : super(text, length)
    /** @type {typeof text} */
    this.text
    /** @type {typeof utf8len} */
    this.utf8len = utf8len
  }

  // modified from CM's implementation
  /** @type {LineUtf8InnerFn} */
  lineInnerUTF8(target, isLine, line, offset) {
    for (let i = 0;; i++) {
      let end = offset + this.text[i].utf8len
      if ((isLine ? line : end) >= target)
        return new LineUTF8(offset, end, line)
      offset = end + 1
      line++
    }
  }
}

class TextNodeV extends TextNode {
  /**
   * @param {TextV[]} children
   * @param {?number} length
   * @param {number} utf8len */
  constructor(children, length, utf8len = textLengthUTF8(children)) {
    length == null ? super(children) : super(children, length)
    /** @type {typeof children} */
    this.children
    /** @type {typeof utf8len} */
    this.utf8len = utf8len
  }

  /** @type {LineUtf8InnerFn} */
  lineInnerUTF8(target, isLine, line, offset) {
    for (let i = 0;; i++) {
      let child = this.children[i], end = offset + child.utf8len, endLine = line + child.lines - 1
      if ((isLine ? endLine : end) >= target)
        return child.lineInnerUTF8(target, isLine, line, offset)
      offset = end + 1
      line = endLine + 1
    }
  }
}

/** @typedef {TextLeafV | TextNodeV} TextV */

/**
 * @this {TextV}
 * @param {number} n */
function lineUTF8(n) {
  if (n < 1 || n > this.lines) throw new RangeError(`Invalid line number ${n} in ${this.lines}-line document`)
  return this.lineInnerUTF8(n, true, 1, 0)
}

/**
 * @this {TextV}
 * @param {number} pos */
function lineAtUTF8(pos) {
  if (pos < 0 || pos > this.utf8len)
    throw new RangeError(`Invalid UTF-8 position ${pos} in document of UTF-8 length ${this.utf8len}`)
  return this.lineInnerUTF8(pos, false, 1, 0)
}

// mixin these methods as if we have a TextV class
TextLeafV.prototype.lineUTF8 = TextNodeV.prototype.lineUTF8 = lineUTF8
TextLeafV.prototype.lineAtUTF8 = TextNodeV.prototype.lineAtUTF8 = lineAtUTF8

/**
 * @param {Text | TextV} t
 * @param {?Transaction} tr
 * @returns {TextV} */
function fixupVirtualText(t, tr = null) {
  // the current line number of leaves
  let lineNum = 0

  /** @param {TextV} t */
  function _countLines(t) {
    if (t instanceof TextLeafV) {
      lineNum += t.text.length
    } else {
      t.children.map(c => _countLines(c))
    }
  }

  /** @param {string | StringV} s */
  function _fixupLine(s) {
    lineNum++
    if (s instanceof StringV) return s
    // as a hack, this function "initates" a virtual text when tr is null
    if (tr == null) return StringV.of(s.length, countSurrogates(s))
    // must reference the original doc to count
    return StringV.of(s.length, countSurrogates(tr.newDoc.line(lineNum).text))
  }

  /**
   * @param {Text | TextV} t
   * @returns {TextV} */
  function _fixup(t) {
    if (t instanceof TextLeafV || t instanceof TextNodeV) {
      _countLines(t)
      return t
    }

    if (t instanceof TextLeaf) {
      const text = t.text.map(s => _fixupLine(s))
      return new TextLeafV(text, t.length)
    }
    if (t instanceof TextNode) {
      const children = t.children.map(c => _fixup(c))
      return new TextNodeV(children, t.length)
    }
    throw new Error('Illegal virtual text structure')
  }

  return _fixup(t)
}

/**
 * @typedef OffsetTable
 * @property {TextV} text - the virtual doc for counting utf8lens
 * @property {Text} doc - the checkpointed doc
 * @property {ChangeSet} uncommitted - diff between doc and current state */
export const offsetTable = StateField.define({
  create(state) {
    const text = fixupVirtualText(state.doc, null)
    /** @type {OffsetTable} */
    const initial = {
      text,
      doc: state.doc,
      uncommitted: ChangeSet.empty(state.doc.length),
    }
    return initial
  },
  update(value, tr) {
    if (tr.docChanged) {
      value = {
        ...value,
        uncommitted: value.uncommitted.compose(tr.changes)
      }
    }

    for (const e of tr.effects) {
      if (e.is(commit)) {
        const vtext = value.uncommitted.apply(value.text)
        const text = fixupVirtualText(vtext, tr)
        value = {
          text,
          doc: tr.newDoc,
          uncommitted: ChangeSet.empty(tr.changes.newLength)
        }
      }
    }

    return value
  }
})

/**
 * @param {EditorState} state
 * @param {number} n */
export function utf8PosToUtf16(state, n) {
  const ot = state.field(offsetTable)
  const { text: vt, doc: dsrc } = ot
  const { from: fromUtf8, number } = vt.lineAtUTF8(n)
  const { from: fromUtf16, text } = dsrc.line(number)
  const cnt = n - fromUtf8
  // skip over cnt units of utf8 and report the final offset in utf16 unit
  let offsUtf16 = 0
  for (let i = 0; i < cnt; i++) {
    const cp = text.codePointAt(offsUtf16)
    if (cp == null) {
      throw new Error('Out of bound')
    }
    offsUtf16 += cp > 0xffff ? 2 : 1
  }
  return fromUtf16 + offsUtf16
}

/**
 * @param {EditorState} state
 * @param {number} n
 * @param {number} assoc
 * @param {MapMode} mode */
export function mapUtf8Pos(state, n, assoc = -1, mode = MapMode.Simple) {
  const { uncommitted } = state.field(offsetTable)
  return uncommitted.mapPos(utf8PosToUtf16(state, n), assoc, mode)
}

/**
 * @param {EditorState} state
 * @param {number} from
 * @param {number} to */
export function mapUtf8Range(state, from, to) {
  const { uncommitted } = state.field(offsetTable)
  const a = uncommitted.mapPos(utf8PosToUtf16(state, from), 1)
  const b = uncommitted.mapPos(utf8PosToUtf16(state, to), -1)
  return [a, b]
}

/**
 * @param {EditorState} state
 * @param {number} n */
export function utf16PosToUtf8(state, n) {
  const { text: vt, doc: dsrc } = state.field(offsetTable)
  const { from: fromUtf16, text, number } = dsrc.lineAt(n)
  const { from: fromUtf8, to: toUtf8 } = vt.lineUTF8(number)
  const cnt = n - fromUtf16
  //  fast paths
  if (cnt == 0) return fromUtf8
  if (cnt == text.length) return toUtf8

  // the position may be invalid!
  const lastcp = text.codePointAt(cnt - 1)
  if (lastcp == null) throw new RangeError('should not happen')
  if (lastcp > 0xffff) return -1
  const surrCount = countSurrogates(text.slice(0, cnt))
  return fromUtf8 + cnt - surrCount
}

/** @returns {import('@codemirror/state').Extension} */
export function offsetTracking() {
  return [
    offsetTable,
  ]
}
