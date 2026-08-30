// @ts-nocheck
import { Prec, StateEffect, StateField, Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, highlightSpecialChars, keymap, showTooltip } from "@codemirror/view";
import { isolateHistory, undo } from "@codemirror/commands";
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/utils.ts
function createElement(view, tagName) {
    return view.dom.ownerDocument.createElement(tagName);
}
function scrollIntoView(container, element) {
    let parent = container.getBoundingClientRect();
    let self = element.getBoundingClientRect();
    let scaleY = parent.height / container.offsetHeight;
    if (self.top < parent.top) container.scrollTop -= (parent.top - self.top) / scaleY;
    else if (self.bottom > parent.bottom) container.scrollTop += (self.bottom - parent.bottom) / scaleY;
}
function toUnicodeRepr(n) {
    return n.toString(16).padStart(4, "0").toUpperCase();
}
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/tooltip.ts
function createCandidateDialog(view) {
    return CandidateDialog.create(view);
}
function genMarkEl(s, matches) {
    const sur = (t, c) => {
        const el = document.createElement(t);
        el.textContent = c;
        return el;
    };
    const el = document.createElement("span");
    let prev = 0;
    for (const [a, b] of matches) {
        if (prev != a) el.appendChild(sur("span", s.slice(prev, a)));
        el.appendChild(sur("mark", s.slice(a, b)));
        prev = b;
    }
    if (prev != s.length) el.appendChild(sur("span", s.slice(prev, s.length)));
    return el;
}
function dispChar(view, c) {
    const span = createElement(view, "span");
    const cp = "U+" + toUnicodeRepr(c.codePointAt(0));
    if (c.match(/\p{Mn}/u)) {
        span.textContent = "◌" + c;
        span.classList = "symbol mono";
    } else if (c.match(/\p{Z}/u)) {
        span.textContent = "⟧​" + c + "​⟦";
        span.classList = "symbol alt";
    } else if (c.match(/\p{C}/u)) {
        span.textContent = "(" + cp + ")";
        span.classList = "symbol unic";
    } else {
        span.textContent = c;
        span.classList = "symbol mono";
    }
    span.title = cp;
    return span;
}
var CandidateDialog = class CandidateDialog {
    view;
    dom;
    overlap = true;
    lastMatchResult = SymbolInputState.emptyResult;
    lastSelection = null;
    constructor(view, dom) {
        this.view = view;
        this.dom = dom;
    }
    getCoords(pos) {
        let rect = this.view.coordsAtPos(pos);
        if (rect == null) return null;
        const extents = this.view.scrollDOM.getBoundingClientRect();
        const gutterWidth = this.view.contentDOM.offsetLeft;
        if (rect.left < extents.left + gutterWidth) {
            if (rect instanceof DOMRect) rect = rect.toJSON();
            return {
                ...rect,
                left: extents.left + gutterWidth,
                right: extents.right
            };
        }
        return rect;
    }
    update(upd) {
        this.render(upd.state);
    }
    render(state) {
        const istate = state.field(symbolInputState);
        if (istate.matches !== this.lastMatchResult) {
            this.lastMatchResult = istate.matches;
            this.lastSelection = istate.selection;
            this.dom.textContent = "";
            const container = createElement(this.view, "div");
            if (istate.matches.exactMatches.length) {
                const desc = createElement(this.view, "div");
                desc.classList = "desc";
                desc.textContent = `${istate.text.replace(/ /g, "␣")} [×${istate.matches.exactMatches.length}]`;
                container.appendChild(desc);
                const ul = createElement(this.view, "ul");
                ul.classList = "exact";
                for (let i = 0; i < istate.matches.exactMatches.length; i++) {
                    const c = istate.matches.exactMatches[i];
                    const li = createElement(this.view, "li");
                    li.appendChild(dispChar(this.view, c));
                    if (istate.selection.onExactMatch && i == istate.selection.selectedIndex) li.classList.add("selected");
                    ul.appendChild(li);
                }
                container.appendChild(ul);
            }
            const ul = createElement(this.view, "ul");
            ul.classList = "matches";
            for (let i = 0; i < istate.matches.candidates.length; i++) {
                const { item, value, matches } = istate.matches.candidates[i];
                const li = createElement(this.view, "li");
                li.appendChild(dispChar(this.view, value[0]));
                const label = genMarkEl(item, matches);
                label.classList = "label";
                li.appendChild(label);
                if (value.length > 1) {
                    const more = createElement(this.view, "span");
                    more.classList = "has-more";
                    more.textContent = ` (+${value.length - 1})`;
                    li.append(more);
                }
                if (!istate.selection.onExactMatch && i == istate.selection.selectedIndex) li.classList.add("selected");
                ul.appendChild(li);
            }
            container.appendChild(ul);
            this.dom.appendChild(container);
        } else if (istate.selection !== this.lastSelection) {
            this.lastSelection = istate.selection;
            this.dom.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
            const el = (istate.selection.onExactMatch ? this.dom.querySelector(".exact") : this.dom.querySelector(".matches")).children[istate.selection.selectedIndex];
            if (el) el.classList.add("selected");
            else console.warn("Cannot find selected element", istate.selection);
        }
        const sel = this.dom.querySelector(".selected");
        if (sel) if (istate.selection.onExactMatch && istate.selection.selectedIndex < 8) this.dom.scrollTop = 0;
        else scrollIntoView(this.dom, sel);
    }
    static create(view) {
        const dom = createElement(view, "div");
        dom.classList = "symbol-input-candidates";
        dom.tabIndex = -1;
        const d = new CandidateDialog(view, dom);
        d.render(view.state);
        return d;
    }
};
//#endregion
//#region node_modules/.pnpm/fzf@0.5.2/node_modules/fzf/dist/fzf.es.js
/** @license
* fzf v0.5.2
* Copyright (c) 2021 Ajit
* Licensed under BSD 3-Clause
*/
const normalized = {
    216: "O",
    223: "s",
    248: "o",
    273: "d",
    295: "h",
    305: "i",
    320: "l",
    322: "l",
    359: "t",
    383: "s",
    384: "b",
    385: "B",
    387: "b",
    390: "O",
    392: "c",
    393: "D",
    394: "D",
    396: "d",
    398: "E",
    400: "E",
    402: "f",
    403: "G",
    407: "I",
    409: "k",
    410: "l",
    412: "M",
    413: "N",
    414: "n",
    415: "O",
    421: "p",
    427: "t",
    429: "t",
    430: "T",
    434: "V",
    436: "y",
    438: "z",
    477: "e",
    485: "g",
    544: "N",
    545: "d",
    549: "z",
    564: "l",
    565: "n",
    566: "t",
    567: "j",
    570: "A",
    571: "C",
    572: "c",
    573: "L",
    574: "T",
    575: "s",
    576: "z",
    579: "B",
    580: "U",
    581: "V",
    582: "E",
    583: "e",
    584: "J",
    585: "j",
    586: "Q",
    587: "q",
    588: "R",
    589: "r",
    590: "Y",
    591: "y",
    592: "a",
    593: "a",
    595: "b",
    596: "o",
    597: "c",
    598: "d",
    599: "d",
    600: "e",
    603: "e",
    604: "e",
    605: "e",
    606: "e",
    607: "j",
    608: "g",
    609: "g",
    610: "G",
    613: "h",
    614: "h",
    616: "i",
    618: "I",
    619: "l",
    620: "l",
    621: "l",
    623: "m",
    624: "m",
    625: "m",
    626: "n",
    627: "n",
    628: "N",
    629: "o",
    633: "r",
    634: "r",
    635: "r",
    636: "r",
    637: "r",
    638: "r",
    639: "r",
    640: "R",
    641: "R",
    642: "s",
    647: "t",
    648: "t",
    649: "u",
    651: "v",
    652: "v",
    653: "w",
    654: "y",
    655: "Y",
    656: "z",
    657: "z",
    663: "c",
    665: "B",
    666: "e",
    667: "G",
    668: "H",
    669: "j",
    670: "k",
    671: "L",
    672: "q",
    686: "h",
    867: "a",
    868: "e",
    869: "i",
    870: "o",
    871: "u",
    872: "c",
    873: "d",
    874: "h",
    875: "m",
    876: "r",
    877: "t",
    878: "v",
    879: "x",
    7424: "A",
    7427: "B",
    7428: "C",
    7429: "D",
    7431: "E",
    7432: "e",
    7433: "i",
    7434: "J",
    7435: "K",
    7436: "L",
    7437: "M",
    7438: "N",
    7439: "O",
    7440: "O",
    7441: "o",
    7442: "o",
    7443: "o",
    7446: "o",
    7447: "o",
    7448: "P",
    7449: "R",
    7450: "R",
    7451: "T",
    7452: "U",
    7453: "u",
    7454: "u",
    7455: "m",
    7456: "V",
    7457: "W",
    7458: "Z",
    7522: "i",
    7523: "r",
    7524: "u",
    7525: "v",
    7834: "a",
    7835: "s",
    8305: "i",
    8341: "h",
    8342: "k",
    8343: "l",
    8344: "m",
    8345: "n",
    8346: "p",
    8347: "s",
    8348: "t",
    8580: "c"
};
for (let i = "̀".codePointAt(0); i <= "ͯ".codePointAt(0); ++i) {
    const diacritic = String.fromCodePoint(i);
    for (const asciiChar of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") {
        const withDiacriticCodePoint = (asciiChar + diacritic).normalize().codePointAt(0);
        if (withDiacriticCodePoint > 126) normalized[withDiacriticCodePoint] = asciiChar;
    }
}
const ranges = {
    a: [7844, 7863],
    e: [7870, 7879],
    o: [7888, 7907],
    u: [7912, 7921]
};
for (const lowerChar of Object.keys(ranges)) {
    const upperChar = lowerChar.toUpperCase();
    for (let i = ranges[lowerChar][0]; i <= ranges[lowerChar][1]; ++i) normalized[i] = i % 2 === 0 ? upperChar : lowerChar;
}
function normalizeRune(rune) {
    if (rune < 192 || rune > 8580) return rune;
    const normalizedChar = normalized[rune];
    if (normalizedChar !== void 0) return normalizedChar.codePointAt(0);
    return rune;
}
function toShort(number) {
    return number;
}
function toInt(number) {
    return number;
}
function maxInt16(num1, num2) {
    return num1 > num2 ? num1 : num2;
}
const strToRunes = (str) => str.split("").map((s) => s.codePointAt(0));
const whitespaceRunes = new Set(" \f\n\r    \v\xA0 \u2028\u2029  　﻿".split("").map((v) => v.codePointAt(0)));
for (let codePoint = " ".codePointAt(0); codePoint <= " ".codePointAt(0); codePoint++) whitespaceRunes.add(codePoint);
const MAX_ASCII = "".codePointAt(0);
const CAPITAL_A_RUNE = "A".codePointAt(0);
const CAPITAL_Z_RUNE = "Z".codePointAt(0);
const SMALL_A_RUNE = "a".codePointAt(0);
const SMALL_Z_RUNE = "z".codePointAt(0);
const NUMERAL_ZERO_RUNE = "0".codePointAt(0);
const NUMERAL_NINE_RUNE = "9".codePointAt(0);
function indexAt(index, max, forward) {
    if (forward) return index;
    return max - index - 1;
}
const SCORE_MATCH = 16;
const SCORE_GAP_START = -3;
const SCORE_GAP_EXTENTION = -1;
const BONUS_BOUNDARY = SCORE_MATCH / 2;
const BONUS_NON_WORD = SCORE_MATCH / 2;
const BONUS_CAMEL_123 = 7;
const BONUS_CONSECUTIVE = 4;
const BONUS_FIRST_CHAR_MULTIPLIER = 2;
function createPosSet(withPos) {
    if (withPos) return /* @__PURE__ */ new Set();
    return null;
}
function alloc16(offset, slab2, size) {
    if (slab2 !== null && slab2.i16.length > offset + size) {
        const subarray = slab2.i16.subarray(offset, offset + size);
        return [offset + size, subarray];
    }
    return [offset, new Int16Array(size)];
}
function alloc32(offset, slab2, size) {
    if (slab2 !== null && slab2.i32.length > offset + size) {
        const subarray = slab2.i32.subarray(offset, offset + size);
        return [offset + size, subarray];
    }
    return [offset, new Int32Array(size)];
}
function charClassOfAscii(rune) {
    if (rune >= SMALL_A_RUNE && rune <= SMALL_Z_RUNE) return 1;
    else if (rune >= CAPITAL_A_RUNE && rune <= CAPITAL_Z_RUNE) return 2;
    else if (rune >= NUMERAL_ZERO_RUNE && rune <= NUMERAL_NINE_RUNE) return 4;
    else return 0;
}
function charClassOfNonAscii(rune) {
    const char = String.fromCodePoint(rune);
    if (char !== char.toUpperCase()) return 1;
    else if (char !== char.toLowerCase()) return 2;
    else if (char.match(/\p{Number}/gu) !== null) return 4;
    else if (char.match(/\p{Letter}/gu) !== null) return 3;
    return 0;
}
function charClassOf(rune) {
    if (rune <= MAX_ASCII) return charClassOfAscii(rune);
    return charClassOfNonAscii(rune);
}
function bonusFor(prevClass, currClass) {
    if (prevClass === 0 && currClass !== 0) return BONUS_BOUNDARY;
    else if (prevClass === 1 && currClass === 2 || prevClass !== 4 && currClass === 4) return BONUS_CAMEL_123;
    else if (currClass === 0) return BONUS_NON_WORD;
    return 0;
}
function bonusAt(input, idx) {
    if (idx === 0) return BONUS_BOUNDARY;
    return bonusFor(charClassOf(input[idx - 1]), charClassOf(input[idx]));
}
function trySkip(input, caseSensitive, char, from) {
    let rest = input.slice(from);
    let idx = rest.indexOf(char);
    if (idx === 0) return from;
    if (!caseSensitive && char >= SMALL_A_RUNE && char <= SMALL_Z_RUNE) {
        if (idx > 0) rest = rest.slice(0, idx);
        const uidx = rest.indexOf(char - 32);
        if (uidx >= 0) idx = uidx;
    }
    if (idx < 0) return -1;
    return from + idx;
}
function isAscii(runes) {
    for (const rune of runes) if (rune >= 128) return false;
    return true;
}
function asciiFuzzyIndex(input, pattern, caseSensitive) {
    if (!isAscii(input)) return 0;
    if (!isAscii(pattern)) return -1;
    let firstIdx = 0, idx = 0;
    for (let pidx = 0; pidx < pattern.length; pidx++) {
        idx = trySkip(input, caseSensitive, pattern[pidx], idx);
        if (idx < 0) return -1;
        if (pidx === 0 && idx > 0) firstIdx = idx - 1;
        idx++;
    }
    return firstIdx;
}
const fuzzyMatchV2 = (caseSensitive, normalize, forward, input, pattern, withPos, slab2) => {
    const M = pattern.length;
    if (M === 0) return [{
        start: 0,
        end: 0,
        score: 0
    }, createPosSet(withPos)];
    const N = input.length;
    if (slab2 !== null && N * M > slab2.i16.length) return fuzzyMatchV1(caseSensitive, normalize, forward, input, pattern, withPos);
    const idx = asciiFuzzyIndex(input, pattern, caseSensitive);
    if (idx < 0) return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
    let offset16 = 0, offset32 = 0, H0 = null, C0 = null, B = null, F = null;
    [offset16, H0] = alloc16(offset16, slab2, N);
    [offset16, C0] = alloc16(offset16, slab2, N);
    [offset16, B] = alloc16(offset16, slab2, N);
    [offset32, F] = alloc32(offset32, slab2, M);
    const [, T] = alloc32(offset32, slab2, N);
    for (let i = 0; i < T.length; i++) T[i] = input[i];
    let maxScore = toShort(0), maxScorePos = 0;
    let pidx = 0, lastIdx = 0;
    const pchar0 = pattern[0];
    let pchar = pattern[0], prevH0 = toShort(0), prevCharClass = 0, inGap = false;
    let Tsub = T.subarray(idx);
    let H0sub = H0.subarray(idx).subarray(0, Tsub.length), C0sub = C0.subarray(idx).subarray(0, Tsub.length), Bsub = B.subarray(idx).subarray(0, Tsub.length);
    for (let [off, char] of Tsub.entries()) {
        let charClass = null;
        if (char <= MAX_ASCII) {
            charClass = charClassOfAscii(char);
            if (!caseSensitive && charClass === 2) char += 32;
        } else {
            charClass = charClassOfNonAscii(char);
            if (!caseSensitive && charClass === 2) char = String.fromCodePoint(char).toLowerCase().codePointAt(0);
            if (normalize) char = normalizeRune(char);
        }
        Tsub[off] = char;
        const bonus = bonusFor(prevCharClass, charClass);
        Bsub[off] = bonus;
        prevCharClass = charClass;
        if (char === pchar) {
            if (pidx < M) {
                F[pidx] = toInt(idx + off);
                pidx++;
                pchar = pattern[Math.min(pidx, M - 1)];
            }
            lastIdx = idx + off;
        }
        if (char === pchar0) {
            const score = SCORE_MATCH + bonus * BONUS_FIRST_CHAR_MULTIPLIER;
            H0sub[off] = score;
            C0sub[off] = 1;
            if (M === 1 && (forward && score > maxScore || !forward && score >= maxScore)) {
                maxScore = score;
                maxScorePos = idx + off;
                if (forward && bonus === BONUS_BOUNDARY) break;
            }
            inGap = false;
        } else {
            if (inGap) H0sub[off] = maxInt16(prevH0 + SCORE_GAP_EXTENTION, 0);
            else H0sub[off] = maxInt16(prevH0 + SCORE_GAP_START, 0);
            C0sub[off] = 0;
            inGap = true;
        }
        prevH0 = H0sub[off];
    }
    if (pidx !== M) return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
    if (M === 1) {
        const result = {
            start: maxScorePos,
            end: maxScorePos + 1,
            score: maxScore
        };
        if (!withPos) return [result, null];
        const pos2 = /* @__PURE__ */ new Set();
        pos2.add(maxScorePos);
        return [result, pos2];
    }
    const f0 = F[0];
    const width = lastIdx - f0 + 1;
    let H = null;
    [offset16, H] = alloc16(offset16, slab2, width * M);
    {
        const toCopy = H0.subarray(f0, lastIdx + 1);
        for (const [i, v] of toCopy.entries()) H[i] = v;
    }
    let [, C] = alloc16(offset16, slab2, width * M);
    {
        const toCopy = C0.subarray(f0, lastIdx + 1);
        for (const [i, v] of toCopy.entries()) C[i] = v;
    }
    const Fsub = F.subarray(1);
    const Psub = pattern.slice(1).slice(0, Fsub.length);
    for (const [off, f] of Fsub.entries()) {
        let inGap2 = false;
        const pchar2 = Psub[off], pidx2 = off + 1, row = pidx2 * width, Tsub2 = T.subarray(f, lastIdx + 1), Bsub2 = B.subarray(f).subarray(0, Tsub2.length), Csub = C.subarray(row + f - f0).subarray(0, Tsub2.length), Cdiag = C.subarray(row + f - f0 - 1 - width).subarray(0, Tsub2.length), Hsub = H.subarray(row + f - f0).subarray(0, Tsub2.length), Hdiag = H.subarray(row + f - f0 - 1 - width).subarray(0, Tsub2.length), Hleft = H.subarray(row + f - f0 - 1).subarray(0, Tsub2.length);
        Hleft[0] = 0;
        for (const [off2, char] of Tsub2.entries()) {
            const col = off2 + f;
            let s1 = 0, s2 = 0, consecutive = 0;
            if (inGap2) s2 = Hleft[off2] + SCORE_GAP_EXTENTION;
            else s2 = Hleft[off2] + SCORE_GAP_START;
            if (pchar2 === char) {
                s1 = Hdiag[off2] + SCORE_MATCH;
                let b = Bsub2[off2];
                consecutive = Cdiag[off2] + 1;
                if (b === BONUS_BOUNDARY) consecutive = 1;
                else if (consecutive > 1) b = maxInt16(b, maxInt16(BONUS_CONSECUTIVE, B[col - consecutive + 1]));
                if (s1 + b < s2) {
                    s1 += Bsub2[off2];
                    consecutive = 0;
                } else s1 += b;
            }
            Csub[off2] = consecutive;
            inGap2 = s1 < s2;
            const score = maxInt16(maxInt16(s1, s2), 0);
            if (pidx2 === M - 1 && (forward && score > maxScore || !forward && score >= maxScore)) {
                maxScore = score;
                maxScorePos = col;
            }
            Hsub[off2] = score;
        }
    }
    const pos = createPosSet(withPos);
    let j = f0;
    if (withPos && pos !== null) {
        let i = M - 1;
        j = maxScorePos;
        let preferMatch = true;
        while (true) {
            const I = i * width, j0 = j - f0, s = H[I + j0];
            let s1 = 0, s2 = 0;
            if (i > 0 && j >= F[i]) s1 = H[I - width + j0 - 1];
            if (j > F[i]) s2 = H[I + j0 - 1];
            if (s > s1 && (s > s2 || s === s2 && preferMatch)) {
                pos.add(j);
                if (i === 0) break;
                i--;
            }
            preferMatch = C[I + j0] > 1 || I + width + j0 + 1 < C.length && C[I + width + j0 + 1] > 0;
            j--;
        }
    }
    return [{
        start: j,
        end: maxScorePos + 1,
        score: maxScore
    }, pos];
};
function calculateScore(caseSensitive, normalize, text, pattern, sidx, eidx, withPos) {
    let pidx = 0, score = 0, inGap = false, consecutive = 0, firstBonus = toShort(0);
    const pos = createPosSet(withPos);
    let prevCharClass = 0;
    if (sidx > 0) prevCharClass = charClassOf(text[sidx - 1]);
    for (let idx = sidx; idx < eidx; idx++) {
        let rune = text[idx];
        const charClass = charClassOf(rune);
        if (!caseSensitive) {
            if (rune >= CAPITAL_A_RUNE && rune <= CAPITAL_Z_RUNE) rune += 32;
            else if (rune > MAX_ASCII) rune = String.fromCodePoint(rune).toLowerCase().codePointAt(0);
        }
        if (normalize) rune = normalizeRune(rune);
        if (rune === pattern[pidx]) {
            if (withPos && pos !== null) pos.add(idx);
            score += SCORE_MATCH;
            let bonus = bonusFor(prevCharClass, charClass);
            if (consecutive === 0) firstBonus = bonus;
            else {
                if (bonus === BONUS_BOUNDARY) firstBonus = bonus;
                bonus = maxInt16(maxInt16(bonus, firstBonus), BONUS_CONSECUTIVE);
            }
            if (pidx === 0) score += bonus * BONUS_FIRST_CHAR_MULTIPLIER;
            else score += bonus;
            inGap = false;
            consecutive++;
            pidx++;
        } else {
            if (inGap) score += SCORE_GAP_EXTENTION;
            else score += SCORE_GAP_START;
            inGap = true;
            consecutive = 0;
            firstBonus = 0;
        }
        prevCharClass = charClass;
    }
    return [score, pos];
}
const fuzzyMatchV1 = (caseSensitive, normalize, forward, text, pattern, withPos, slab2) => {
    if (pattern.length === 0) return [{
        start: 0,
        end: 0,
        score: 0
    }, null];
    if (asciiFuzzyIndex(text, pattern, caseSensitive) < 0) return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
    let pidx = 0, sidx = -1, eidx = -1;
    const lenRunes = text.length;
    const lenPattern = pattern.length;
    for (let index = 0; index < lenRunes; index++) {
        let rune = text[indexAt(index, lenRunes, forward)];
        if (!caseSensitive) {
            if (rune >= CAPITAL_A_RUNE && rune <= CAPITAL_Z_RUNE) rune += 32;
            else if (rune > MAX_ASCII) rune = String.fromCodePoint(rune).toLowerCase().codePointAt(0);
        }
        if (normalize) rune = normalizeRune(rune);
        const pchar = pattern[indexAt(pidx, lenPattern, forward)];
        if (rune === pchar) {
            if (sidx < 0) sidx = index;
            pidx++;
            if (pidx === lenPattern) {
                eidx = index + 1;
                break;
            }
        }
    }
    if (sidx >= 0 && eidx >= 0) {
        pidx--;
        for (let index = eidx - 1; index >= sidx; index--) {
            let rune = text[indexAt(index, lenRunes, forward)];
            if (!caseSensitive) {
                if (rune >= CAPITAL_A_RUNE && rune <= CAPITAL_Z_RUNE) rune += 32;
                else if (rune > MAX_ASCII) rune = String.fromCodePoint(rune).toLowerCase().codePointAt(0);
            }
            const pchar = pattern[indexAt(pidx, lenPattern, forward)];
            if (rune === pchar) {
                pidx--;
                if (pidx < 0) {
                    sidx = index;
                    break;
                }
            }
        }
        if (!forward) {
            const sidxTemp = sidx;
            sidx = lenRunes - eidx;
            eidx = lenRunes - sidxTemp;
        }
        const [score, pos] = calculateScore(caseSensitive, normalize, text, pattern, sidx, eidx, withPos);
        return [{
            start: sidx,
            end: eidx,
            score
        }, pos];
    }
    return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
};
const exactMatchNaive = (caseSensitive, normalize, forward, text, pattern, withPos, slab2) => {
    if (pattern.length === 0) return [{
        start: 0,
        end: 0,
        score: 0
    }, null];
    const lenRunes = text.length;
    const lenPattern = pattern.length;
    if (lenRunes < lenPattern) return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
    if (asciiFuzzyIndex(text, pattern, caseSensitive) < 0) return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
    let pidx = 0;
    let bestPos = -1, bonus = toShort(0), bestBonus = toShort(-1);
    for (let index = 0; index < lenRunes; index++) {
        const index_ = indexAt(index, lenRunes, forward);
        let rune = text[index_];
        if (!caseSensitive) {
            if (rune >= CAPITAL_A_RUNE && rune <= CAPITAL_Z_RUNE) rune += 32;
            else if (rune > MAX_ASCII) rune = String.fromCodePoint(rune).toLowerCase().codePointAt(0);
        }
        if (normalize) rune = normalizeRune(rune);
        const pidx_ = indexAt(pidx, lenPattern, forward);
        if (pattern[pidx_] === rune) {
            if (pidx_ === 0) bonus = bonusAt(text, index_);
            pidx++;
            if (pidx === lenPattern) {
                if (bonus > bestBonus) {
                    bestPos = index;
                    bestBonus = bonus;
                }
                if (bonus === BONUS_BOUNDARY) break;
                index -= pidx - 1;
                pidx = 0;
                bonus = 0;
            }
        } else {
            index -= pidx;
            pidx = 0;
            bonus = 0;
        }
    }
    if (bestPos >= 0) {
        let sidx = 0, eidx = 0;
        if (forward) {
            sidx = bestPos - lenPattern + 1;
            eidx = bestPos + 1;
        } else {
            sidx = lenRunes - (bestPos + 1);
            eidx = lenRunes - (bestPos - lenPattern + 1);
        }
        const [score] = calculateScore(caseSensitive, normalize, text, pattern, sidx, eidx, false);
        return [{
            start: sidx,
            end: eidx,
            score
        }, null];
    }
    return [{
        start: -1,
        end: -1,
        score: 0
    }, null];
};
const SLAB_16_SIZE = 100 * 1024;
const SLAB_32_SIZE = 2048;
function makeSlab(size16, size32) {
    return {
        i16: new Int16Array(size16),
        i32: new Int32Array(size32)
    };
}
const slab = makeSlab(SLAB_16_SIZE, SLAB_32_SIZE);
const buildPatternForBasicMatch = (query, casing, normalize) => {
    let caseSensitive = false;
    switch (casing) {
        case "smart-case":
            if (query.toLowerCase() !== query) caseSensitive = true;
            break;
        case "case-sensitive":
            caseSensitive = true;
            break;
        case "case-insensitive":
            query = query.toLowerCase();
            caseSensitive = false;
            break;
    }
    let queryRunes = strToRunes(query);
    if (normalize) queryRunes = queryRunes.map(normalizeRune);
    return {
        queryRunes,
        caseSensitive
    };
};
function getResultFromScoreMap(scoreMap, limit) {
    const scoresInDesc = Object.keys(scoreMap).map((v) => parseInt(v, 10)).sort((a, b) => b - a);
    let result = [];
    for (const score of scoresInDesc) {
        result = result.concat(scoreMap[score]);
        if (result.length >= limit) break;
    }
    return result;
}
function getBasicMatchIter(scoreMap, queryRunes, caseSensitive) {
    return (idx) => {
        const itemRunes = this.runesList[idx];
        if (queryRunes.length > itemRunes.length) return;
        let [match, positions] = this.algoFn(caseSensitive, this.opts.normalize, this.opts.forward, itemRunes, queryRunes, true, slab);
        if (match.start === -1) return;
        if (this.opts.fuzzy === false) {
            positions = /* @__PURE__ */ new Set();
            for (let position = match.start; position < match.end; ++position) positions.add(position);
        }
        const scoreKey = this.opts.sort ? match.score : 0;
        if (scoreMap[scoreKey] === void 0) scoreMap[scoreKey] = [];
        scoreMap[scoreKey].push({
            item: this.items[idx],
            ...match,
            positions: positions != null ? positions : /* @__PURE__ */ new Set()
        });
    };
}
function basicMatch(query) {
    const { queryRunes, caseSensitive } = buildPatternForBasicMatch(query, this.opts.casing, this.opts.normalize);
    const scoreMap = {};
    const iter2 = getBasicMatchIter.bind(this)(scoreMap, queryRunes, caseSensitive);
    for (let i = 0, len = this.runesList.length; i < len; ++i) iter2(i);
    return getResultFromScoreMap(scoreMap, this.opts.limit);
}
const defaultOpts = {
    limit: Infinity,
    selector: (v) => v,
    casing: "smart-case",
    normalize: true,
    fuzzy: "v2",
    tiebreakers: [],
    sort: true,
    forward: true
};
var BaseFinder = class {
    constructor(list, ...optionsTuple) {
        this.opts = {
            ...defaultOpts,
            ...optionsTuple[0]
        };
        this.items = list;
        this.runesList = list.map((item) => strToRunes(this.opts.selector(item).normalize()));
        this.algoFn = exactMatchNaive;
        switch (this.opts.fuzzy) {
            case "v2":
                this.algoFn = fuzzyMatchV2;
                break;
            case "v1":
                this.algoFn = fuzzyMatchV1;
                break;
        }
    }
};
const syncDefaultOpts = {
    ...defaultOpts,
    match: basicMatch
};
var SyncFinder = class extends BaseFinder {
    constructor(list, ...optionsTuple) {
        super(list, ...optionsTuple);
        this.opts = {
            ...syncDefaultOpts,
            ...optionsTuple[0]
        };
    }
    find(query) {
        if (query.length === 0 || this.items.length === 0) return this.items.slice(0, this.opts.limit).map(createResultItemWithEmptyPos);
        query = query.normalize();
        return postProcessResultItems(this.opts.match.bind(this)(query), this.opts);
    }
};
({ ...defaultOpts });
const createResultItemWithEmptyPos = (item) => ({
    item,
    start: -1,
    end: -1,
    score: 0,
    positions: /* @__PURE__ */ new Set()
});
function postProcessResultItems(result, opts) {
    if (opts.sort) {
        const { selector } = opts;
        result.sort((a, b) => {
            if (a.score === b.score) for (const tiebreaker of opts.tiebreakers) {
                const diff = tiebreaker(a, b, selector);
                if (diff !== 0) return diff;
            }
            return 0;
        });
    }
    if (Number.isFinite(opts.limit)) result.splice(opts.limit);
    return result;
}
function byStartAsc(a, b) {
    return a.start - b.start;
}
var Fzf = class {
    constructor(list, ...optionsTuple) {
        this.finder = new SyncFinder(list, ...optionsTuple);
        this.find = this.finder.find.bind(this.finder);
    }
};
//#endregion
//#region packages/app/src/lib/codemirror/dict.json
var dict_default = {
    " ": ["\xA0"],
    "!": ["！", "¡"],
    "!!": ["‼"],
    "!?": ["⁉"],
    "\"": ["̈"],
    "\"'": ["“"],
    "\"<": ["«"],
    "\">": ["»"],
    "\"A": ["Ä"],
    "\"E": ["Ë"],
    "\"H": ["Ḧ"],
    "\"I": ["Ï"],
    "\"O": ["Ö"],
    "\"U": ["Ü"],
    "\"W": ["Ẅ"],
    "\"X": ["Ẍ"],
    "\"Y": ["Ÿ"],
    "\"`": ["„"],
    "\"a": ["ä"],
    "\"e": ["ë"],
    "\"h": ["ḧ"],
    "\"i": ["ï"],
    "\"o": ["ö"],
    "\"t": ["ẗ"],
    "\"u": ["ü"],
    "\"w": ["ẅ"],
    "\"x": ["ẍ"],
    "\"y": ["ÿ"],
    "\"{A}": ["Ä"],
    "\"{E}": ["Ë"],
    "\"{H}": ["Ḧ"],
    "\"{I}": ["Ï"],
    "\"{O}": ["Ö"],
    "\"{U}": ["Ü"],
    "\"{W}": ["Ẅ"],
    "\"{X}": ["Ẍ"],
    "\"{Y}": ["Ÿ"],
    "\"{a}": ["ä"],
    "\"{e}": ["ë"],
    "\"{h}": ["ḧ"],
    "\"{i}": ["ï"],
    "\"{o}": ["ö"],
    "\"{t}": ["ẗ"],
    "\"{u}": ["ü"],
    "\"{w}": ["ẅ"],
    "\"{x}": ["ẍ"],
    "\"{y}": ["ÿ"],
    "\"{}": ["¨"],
    "#": ["♯", "＃"],
    "##": ["𝄪"],
    "%": ["％"],
    "&": [
        "⅋",
        "﹠",
        "＆"
    ],
    "'": [
        "́",
        "′",
        "″",
        "‴",
        "⁗",
        "＇"
    ],
    "'A": ["Á"],
    "'C": ["Ć"],
    "'E": ["É"],
    "'G": ["Ǵ"],
    "'I": ["Í"],
    "'K": ["Ḱ"],
    "'L": ["Ĺ"],
    "'M": ["Ḿ"],
    "'N": ["Ń"],
    "'O": ["Ó"],
    "'P": ["Ṕ"],
    "'R": ["Ŕ"],
    "'S": ["Ś"],
    "'U": ["Ú"],
    "'W": ["Ẃ"],
    "'Y": ["Ý"],
    "'Z": ["Ź"],
    "'\\AE": ["Ǽ"],
    "'\\O": ["Ǿ"],
    "'\\ae": ["ǽ"],
    "'\\o": ["ǿ"],
    "'a": ["á"],
    "'c": ["ć"],
    "'e": ["é"],
    "'g": ["ǵ"],
    "'i": ["í"],
    "'k": ["ḱ"],
    "'l": ["ĺ"],
    "'m": ["ḿ"],
    "'n": ["ń"],
    "'o": ["ó"],
    "'p": ["ṕ"],
    "'r": ["ŕ"],
    "'s": ["ś"],
    "'u": ["ú"],
    "'w": ["ẃ"],
    "'y": ["ý"],
    "'z": ["ź"],
    "'{A}": ["Á"],
    "'{C}": ["Ć"],
    "'{E}": ["É"],
    "'{G}": ["Ǵ"],
    "'{I}": ["Í"],
    "'{K}": ["Ḱ"],
    "'{L}": ["Ĺ"],
    "'{M}": ["Ḿ"],
    "'{N}": ["Ń"],
    "'{O}": ["Ó"],
    "'{P}": ["Ṕ"],
    "'{R}": ["Ŕ"],
    "'{S}": ["Ś"],
    "'{U}": ["Ú"],
    "'{W}": ["Ẃ"],
    "'{Y}": ["Ý"],
    "'{Z}": ["Ź"],
    "'{\\AE}": ["Ǽ"],
    "'{\\O}": ["Ǿ"],
    "'{\\ae}": ["ǽ"],
    "'{\\o}": ["ǿ"],
    "'{a}": ["á"],
    "'{c}": ["ć"],
    "'{e}": ["é"],
    "'{g}": ["ǵ"],
    "'{i}": ["í"],
    "'{k}": ["ḱ"],
    "'{l}": ["ĺ"],
    "'{m}": ["ḿ"],
    "'{n}": ["ń"],
    "'{o}": ["ó"],
    "'{p}": ["ṕ"],
    "'{r}": ["ŕ"],
    "'{s}": ["ś"],
    "'{u}": ["ú"],
    "'{w}": ["ẃ"],
    "'{y}": ["ý"],
    "'{z}": ["ź"],
    "'{}": ["´"],
    "(": [
        "(",
        "[",
        "{",
        "⁅",
        "⁽",
        "₍",
        "〈",
        "⎴",
        "⟅",
        "⟦",
        "⟨",
        "⟪",
        "⦃",
        "〈",
        "《",
        "「",
        "『",
        "【",
        "〔",
        "〖",
        "〚",
        "︵",
        "︷",
        "︹",
        "︻",
        "︽",
        "︿",
        "﹁",
        "﹃",
        "﹙",
        "﹛",
        "﹝",
        "（",
        "［",
        "｛",
        "｢",
        "❪",
        "❬",
        "❰",
        "❲",
        "❴",
        "⟮",
        "⦅",
        "⦗",
        "⧼",
        "⸨",
        "❮",
        "⦇",
        "⦉"
    ],
    "((": ["⦅", "｟"],
    "(0)": [
        "⓪",
        "🄀",
        "⓿",
        "🄋",
        "🄌"
    ],
    "(1)": [
        "⑴",
        "①",
        "⒈",
        "❶",
        "➀",
        "➊"
    ],
    "(2)": [
        "⑵",
        "②",
        "⒉",
        "❷",
        "➁",
        "➋"
    ],
    "(3)": [
        "⑶",
        "③",
        "⒊",
        "❸",
        "➂",
        "➌"
    ],
    "(4)": [
        "⑷",
        "④",
        "⒋",
        "❹",
        "➃",
        "➍"
    ],
    "(5)": [
        "⑸",
        "⑤",
        "⒌",
        "❺",
        "➄",
        "➎"
    ],
    "(6)": [
        "⑹",
        "⑥",
        "⒍",
        "❻",
        "➅",
        "➏"
    ],
    "(7)": [
        "⑺",
        "⑦",
        "⒎",
        "❼",
        "➆",
        "➐"
    ],
    "(8)": [
        "⑻",
        "⑧",
        "⒏",
        "❽",
        "➇",
        "➑"
    ],
    "(9)": [
        "⑼",
        "⑨",
        "⒐",
        "❾",
        "➈",
        "➒"
    ],
    "(10)": [
        "⑽",
        "⑩",
        "⒑",
        "❿",
        "➉",
        "➓"
    ],
    "(11)": [
        "⑾",
        "⑪",
        "⒒",
        "⓫"
    ],
    "(12)": [
        "⑿",
        "⑫",
        "⒓",
        "⓬"
    ],
    "(13)": [
        "⒀",
        "⑬",
        "⒔",
        "⓭"
    ],
    "(14)": [
        "⒁",
        "⑭",
        "⒕",
        "⓮"
    ],
    "(15)": [
        "⒂",
        "⑮",
        "⒖",
        "⓯"
    ],
    "(16)": [
        "⒃",
        "⑯",
        "⒗",
        "⓰"
    ],
    "(17)": [
        "⒄",
        "⑰",
        "⒘",
        "⓱"
    ],
    "(18)": [
        "⒅",
        "⑱",
        "⒙",
        "⓲"
    ],
    "(19)": [
        "⒆",
        "⑲",
        "⒚",
        "⓳"
    ],
    "(20)": [
        "⒇",
        "⑳",
        "⒛",
        "⓴"
    ],
    "(=": ["≘"],
    "(a)": [
        "⒜",
        "Ⓐ",
        "ⓐ",
        "🅐",
        "🄰",
        "🅰"
    ],
    "(b": ["⟅"],
    "(b)": [
        "⒝",
        "Ⓑ",
        "ⓑ",
        "🅑",
        "🄱",
        "🅱"
    ],
    "(c)": [
        "⒞",
        "Ⓒ",
        "ⓒ",
        "🅒",
        "🄲",
        "🅲"
    ],
    "(d)": [
        "⒟",
        "Ⓓ",
        "ⓓ",
        "🅓",
        "🄳",
        "🅳"
    ],
    "(e)": [
        "⒠",
        "Ⓔ",
        "ⓔ",
        "🅔",
        "🄴",
        "🅴"
    ],
    "(f)": [
        "⒡",
        "Ⓕ",
        "ⓕ",
        "🅕",
        "🄵",
        "🅵"
    ],
    "(g)": [
        "⒢",
        "Ⓖ",
        "ⓖ",
        "🅖",
        "🄶",
        "🅶"
    ],
    "(h)": [
        "⒣",
        "Ⓗ",
        "ⓗ",
        "🅗",
        "🄷",
        "🅷"
    ],
    "(i)": [
        "⒤",
        "Ⓘ",
        "ⓘ",
        "🅘",
        "🄸",
        "🅸"
    ],
    "(j)": [
        "⒥",
        "Ⓙ",
        "ⓙ",
        "🅙",
        "🄹",
        "🅹"
    ],
    "(k)": [
        "⒦",
        "Ⓚ",
        "ⓚ",
        "🅚",
        "🄺",
        "🅺"
    ],
    "(l)": [
        "⒧",
        "Ⓛ",
        "ⓛ",
        "🅛",
        "🄻",
        "🅻"
    ],
    "(m)": [
        "⒨",
        "Ⓜ",
        "ⓜ",
        "🅜",
        "🄼",
        "🅼"
    ],
    "(n)": [
        "⒩",
        "Ⓝ",
        "ⓝ",
        "🅝",
        "🄽",
        "🅽"
    ],
    "(o)": [
        "⒪",
        "Ⓞ",
        "ⓞ",
        "🅞",
        "🄾",
        "🅾"
    ],
    "(p)": [
        "⒫",
        "Ⓟ",
        "ⓟ",
        "🅟",
        "🄿",
        "🅿"
    ],
    "(q)": [
        "⒬",
        "Ⓠ",
        "ⓠ",
        "🅠",
        "🅀",
        "🆀"
    ],
    "(r)": [
        "⒭",
        "Ⓡ",
        "ⓡ",
        "🅡",
        "🅁",
        "🆁"
    ],
    "(s)": [
        "⒮",
        "Ⓢ",
        "ⓢ",
        "🅢",
        "🅂",
        "🆂"
    ],
    "(t)": [
        "⒯",
        "Ⓣ",
        "ⓣ",
        "🅣",
        "🅃",
        "🆃"
    ],
    "(u)": [
        "⒰",
        "Ⓤ",
        "ⓤ",
        "🅤",
        "🅄",
        "🆄"
    ],
    "(v)": [
        "⒱",
        "Ⓥ",
        "ⓥ",
        "🅥",
        "🅅",
        "🆅"
    ],
    "(w)": [
        "⒲",
        "Ⓦ",
        "ⓦ",
        "🅦",
        "🅆",
        "🆆"
    ],
    "(x)": [
        "⒳",
        "Ⓧ",
        "ⓧ",
        "🅧",
        "🅇",
        "🆇"
    ],
    "(y)": [
        "⒴",
        "Ⓨ",
        "ⓨ",
        "🅨",
        "🅈",
        "🆈"
    ],
    "(z)": [
        "⒵",
        "Ⓩ",
        "ⓩ",
        "🅩",
        "🅉",
        "🆉"
    ],
    "(|": ["⦇"],
    ")": [
        ")",
        "]",
        "}",
        "⁆",
        "⁾",
        "₎",
        "〉",
        "⎵",
        "⟆",
        "⟧",
        "⟩",
        "⟫",
        "⦄",
        "〉",
        "》",
        "」",
        "』",
        "】",
        "〕",
        "〗",
        "〛",
        "︶",
        "︸",
        "︺",
        "︼",
        "︾",
        "﹀",
        "﹂",
        "﹄",
        "﹚",
        "﹜",
        "﹞",
        "）",
        "］",
        "｝",
        "｣",
        "❫",
        "❭",
        "❱",
        "❳",
        "❵",
        "⟯",
        "⦆",
        "⦘",
        "⧽",
        "⸩",
        "❯",
        "⦈",
        "⦊"
    ],
    "))": ["⦆", "｠"],
    ")b": ["⟆"],
    "*": ["⋆", "＊"],
    "*=": ["≛"],
    "+": ["＋"],
    "+ ": ["⊹"],
    "++": ["⧺"],
    ",": [
        " ",
        "ʻ",
        "،",
        "⸲",
        "⸴",
        "⹁",
        "⹉",
        "、",
        "︐",
        "︑",
        "﹐",
        "﹑",
        "，",
        "､"
    ],
    "-": ["­"],
    "---": [
        "─",
        "│",
        "┌",
        "┐",
        "└",
        "┘",
        "├",
        "┤",
        "┬",
        "┼",
        "┴",
        "╴",
        "╵",
        "╶",
        "╷",
        "╭",
        "╮",
        "╯",
        "╰",
        "╱",
        "╲",
        "╳"
    ],
    "--.": [
        "╌",
        "╎",
        "┄",
        "┆",
        "┈",
        "┊",
        "╍",
        "╏",
        "┅",
        "┇",
        "┉",
        "┋"
    ],
    "--=": [
        "═",
        "║",
        "╔",
        "╗",
        "╚",
        "╝",
        "╠",
        "╣",
        "╦",
        "╬",
        "╩",
        "╒",
        "╕",
        "╘",
        "╛",
        "╞",
        "╡",
        "╤",
        "╪",
        "╧",
        "╓",
        "╖",
        "╙",
        "╜",
        "╟",
        "╢",
        "╥",
        "╫",
        "╨"
    ],
    "-->": ["⟶"],
    "--_": [
        "━",
        "┃",
        "┏",
        "┓",
        "┗",
        "┛",
        "┣",
        "┫",
        "┳",
        "╋",
        "┻",
        "╸",
        "╹",
        "╺",
        "╻",
        "┍",
        "┯",
        "┑",
        "┕",
        "┷",
        "┙",
        "┝",
        "┿",
        "┥",
        "┎",
        "┰",
        "┒",
        "┖",
        "┸",
        "┚",
        "┠",
        "╂",
        "┨",
        "┞",
        "╀",
        "┦",
        "┟",
        "╁",
        "┧",
        "┢",
        "╈",
        "┪",
        "┡",
        "╇",
        "┩",
        "┮",
        "┭",
        "┶",
        "┵",
        "┾",
        "┽",
        "┲",
        "┱",
        "┺",
        "┹",
        "╊",
        "╉",
        "╆",
        "╅",
        "╄",
        "╃",
        "╿",
        "╽",
        "╼",
        "╾"
    ],
    "--|": ["⟞"],
    "-:": ["∹"],
    "->": ["→"],
    "->n": ["↛"],
    "-o": ["⊸"],
    "-|": ["⊣"],
    "-||-": ["⟛"],
    "-~": ["≂"],
    ".": [
        "̇",
        "∙",
        "．"
    ],
    ".+": ["∔"],
    ".-": ["∸"],
    "...": [
        "⋯",
        "⋮",
        "⋰",
        "⋱"
    ],
    ".=": ["≐"],
    ".=.": ["≑"],
    ".A": ["Ȧ"],
    ".B": ["Ḃ"],
    ".C": ["Ċ"],
    ".D": ["Ḋ"],
    ".E": ["Ė"],
    ".F": ["Ḟ"],
    ".G": ["Ġ"],
    ".H": ["Ḣ"],
    ".I": ["İ"],
    ".M": ["Ṁ"],
    ".N": ["Ṅ"],
    ".O": ["Ȯ"],
    ".P": ["Ṗ"],
    ".R": ["Ṙ"],
    ".S": ["Ṡ"],
    ".T": ["Ṫ"],
    ".W": ["Ẇ"],
    ".X": ["Ẋ"],
    ".Y": ["Ẏ"],
    ".Z": ["Ż"],
    ".a": ["ȧ"],
    ".b": ["ḃ"],
    ".c": ["ċ"],
    ".d": ["ḋ"],
    ".e": ["ė"],
    ".f": ["ḟ"],
    ".g": ["ġ"],
    ".h": ["ḣ"],
    ".m": ["ṁ"],
    ".n": ["ṅ"],
    ".o": ["ȯ"],
    ".p": ["ṗ"],
    ".r": ["ṙ"],
    ".s": ["ṡ"],
    ".t": ["ṫ"],
    ".w": ["ẇ"],
    ".x": ["ẋ"],
    ".y": ["ẏ"],
    ".z": ["ż"],
    ".{A}": ["Ȧ"],
    ".{B}": ["Ḃ"],
    ".{C}": ["Ċ"],
    ".{D}": ["Ḋ"],
    ".{E}": ["Ė"],
    ".{F}": ["Ḟ"],
    ".{G}": ["Ġ"],
    ".{H}": ["Ḣ"],
    ".{I}": ["İ"],
    ".{M}": ["Ṁ"],
    ".{N}": ["Ṅ"],
    ".{O}": ["Ȯ"],
    ".{P}": ["Ṗ"],
    ".{R}": ["Ṙ"],
    ".{S}": ["Ṡ"],
    ".{T}": ["Ṫ"],
    ".{W}": ["Ẇ"],
    ".{X}": ["Ẋ"],
    ".{Y}": ["Ẏ"],
    ".{Z}": ["Ż"],
    ".{a}": ["ȧ"],
    ".{b}": ["ḃ"],
    ".{c}": ["ċ"],
    ".{d}": ["ḋ"],
    ".{e}": ["ė"],
    ".{f}": ["ḟ"],
    ".{g}": ["ġ"],
    ".{h}": ["ḣ"],
    ".{m}": ["ṁ"],
    ".{n}": ["ṅ"],
    ".{o}": ["ȯ"],
    ".{p}": ["ṗ"],
    ".{r}": ["ṙ"],
    ".{s}": ["ṡ"],
    ".{t}": ["ṫ"],
    ".{w}": ["ẇ"],
    ".{x}": ["ẋ"],
    ".{y}": ["ẏ"],
    ".{z}": ["ż"],
    ".{}": ["˙"],
    "/": [
        "‌",
        "／",
        "＼"
    ],
    "0": ["∅"],
    "8<": ["✂", "✄"],
    ":": [
        " ",
        "∶",
        "⦂",
        "ː",
        "꞉",
        "˸",
        "፥",
        "፦",
        "：",
        "﹕",
        "︓"
    ],
    "::": ["∷"],
    "::-": ["∺"],
    ":=": ["≔"],
    ":~": ["∻"],
    ";": [
        " ",
        "⨾",
        "⨟",
        "⁏",
        "፤",
        "꛶",
        "；",
        "︔",
        "﹔",
        "⍮",
        "⸵",
        ";"
    ],
    "<": [
        "⟨",
        "<",
        "≪",
        "⋘",
        "≺",
        "⊂",
        "⋐",
        "⊏",
        "⊰",
        "⊲",
        "⋖",
        "＜"
    ],
    "<-": ["←"],
    "<--": ["⟵"],
    "<-->": ["⟷"],
    "<->": ["↔"],
    "<->n": ["↮"],
    "<-n": ["↚"],
    "<<": ["⟪"],
    "<=": ["≤", "⇐"],
    "<=>": ["⇔"],
    "<=>n": ["⇎"],
    "<=n": ["≰"],
    "<n": ["≮"],
    "<|": ["⦉"],
    "<~": ["≲"],
    "<~n": ["⋦"],
    "<~nn": ["≴"],
    "=": ["̄", "＝"],
    "=:": ["≕"],
    "==": ["≡"],
    "===": ["≣"],
    "==n": ["≢"],
    "=>": ["⇒"],
    "=>n": ["⇏"],
    "=A": ["Ā"],
    "=E": ["Ē"],
    "=G": ["Ḡ"],
    "=I": ["Ī"],
    "=O": ["Ō"],
    "=U": ["Ū"],
    "=Y": ["Ȳ"],
    "=\\AE": ["Ǣ"],
    "=\\ae": ["ǣ"],
    "=a": ["ā"],
    "=e": ["ē"],
    "=g": ["ḡ"],
    "=i": ["ī"],
    "=n": ["≠"],
    "=o": ["ō", "≗"],
    "=u": ["ū"],
    "=y": ["ȳ"],
    "={A}": ["Ā"],
    "={E}": ["Ē"],
    "={G}": ["Ḡ"],
    "={I}": ["Ī"],
    "={O}": ["Ō"],
    "={U}": ["Ū"],
    "={Y}": ["Ȳ"],
    "={\\AE}": ["Ǣ"],
    "={\\ae}": ["ǣ"],
    "={\\i}": ["ī"],
    "={a}": ["ā"],
    "={e}": ["ē"],
    "={g}": ["ḡ"],
    "={i}": ["ī"],
    "={o}": ["ō"],
    "={u}": ["ū"],
    "={y}": ["ȳ"],
    "={}": ["¯"],
    ">": [
        "⟩",
        ">",
        "≫",
        "⋙",
        "≻",
        "⊃",
        "⋑",
        "⊐",
        "⊱",
        "⊳",
        "⋗",
        "＞"
    ],
    ">=": ["≥"],
    ">=n": ["≱"],
    ">>": ["⟫"],
    ">n": ["≯"],
    ">~": ["≳"],
    ">~n": ["⋧"],
    ">~nn": ["≵"],
    "?": ["？", "¿"],
    "?!": ["‽", "⁈"],
    "?=": ["≟"],
    "??": ["⁇"],
    "@": ["＠"],
    AA: ["Å"],
    AE: ["Æ"],
    Alpha: ["Α"],
    And: ["⋀"],
    B0: ["𝟎"],
    B1: ["𝟏"],
    B2: ["𝟐"],
    B3: ["𝟑"],
    B4: ["𝟒"],
    B5: ["𝟓"],
    B6: ["𝟔"],
    B7: ["𝟕"],
    B8: ["𝟖"],
    B9: ["𝟗"],
    BA: ["𝐀"],
    BB: ["𝐁"],
    BC: ["𝐂"],
    BD: ["𝐃"],
    BE: ["𝐄"],
    BF: ["𝐅"],
    BG: ["𝐆"],
    BGA: ["𝚨"],
    BGB: ["𝚩"],
    BGC: ["𝚾"],
    BGD: ["𝚫"],
    BGE: ["𝚬"],
    BGF: ["𝚽"],
    BGG: ["𝚪"],
    BGH: ["𝚮"],
    BGI: ["𝚰"],
    BGK: ["𝚱"],
    BGL: ["𝚲"],
    BGM: ["𝚳"],
    BGN: ["𝚴"],
    BGO: ["𝛀"],
    BGP: ["𝚿"],
    BGR: ["𝚸"],
    BGS: ["𝚺"],
    BGT: ["𝚻"],
    BGTH: ["𝚯"],
    BGU: ["𝚼"],
    BGX: ["𝚵"],
    BGZ: ["𝚭"],
    BGa: ["𝛂"],
    BGb: ["𝛃"],
    BGc: ["𝛘"],
    BGd: ["𝛅"],
    BGe: ["𝛆"],
    BGf: ["𝛗"],
    BGg: ["𝛄"],
    BGh: ["𝛈"],
    BGi: ["𝛊"],
    BGk: ["𝛋"],
    BGl: ["𝛌"],
    BGm: ["𝛍"],
    BGn: ["𝛎"],
    BGo: ["𝛚"],
    BGp: ["𝛙"],
    BGr: ["𝛒"],
    BGs: ["𝛔"],
    BGt: ["𝛕"],
    BGth: ["𝛉"],
    BGu: ["𝛖"],
    BGx: ["𝛏"],
    BGz: ["𝛇"],
    BH: ["𝐇"],
    BI: ["𝐈"],
    BJ: ["𝐉"],
    BK: ["𝐊"],
    BL: ["𝐋"],
    BM: ["𝐌"],
    BN: ["𝐍"],
    BO: ["𝐎"],
    BOmicron: ["𝚶"],
    BP: ["𝐏"],
    BPi: ["𝚷"],
    BQ: ["𝐐"],
    BR: ["𝐑"],
    BS: ["𝐒"],
    BT: ["𝐓"],
    BU: ["𝐔"],
    BV: ["𝐕"],
    BW: ["𝐖"],
    BX: ["𝐗"],
    BY: ["𝐘"],
    BZ: ["𝐙"],
    Ba: ["𝐚"],
    Bb: ["𝐛"],
    "Bbb{C}": ["ℂ"],
    "Bbb{H}": ["ℍ"],
    "Bbb{N}": ["ℕ"],
    "Bbb{P}": ["ℙ"],
    "Bbb{Q}": ["ℚ"],
    "Bbb{R}": ["ℝ"],
    "Bbb{Z}": ["ℤ"],
    Bc: ["𝐜"],
    Bd: ["𝐝"],
    Be: ["𝐞"],
    Beta: ["Β"],
    Bf: ["𝐟"],
    Bg: ["𝐠"],
    Bh: ["𝐡"],
    Bi: ["𝐢"],
    Bj: ["𝐣"],
    Bk: ["𝐤"],
    Bl: ["𝐥"],
    Bm: ["𝐦"],
    Bn: ["𝐧"],
    Bo: ["𝐨"],
    Bomicron: ["𝛐"],
    Bot: ["⟘"],
    Box: ["□"],
    Bp: ["𝐩"],
    Bpi: ["𝛑"],
    Bq: ["𝐪"],
    Br: ["𝐫"],
    Bs: ["𝐬"],
    Bt: ["𝐭"],
    Bu: ["𝐮"],
    Bumpeq: ["≎"],
    Bv: ["𝐯"],
    Bw: ["𝐰"],
    Bx: ["𝐱"],
    By: ["𝐲"],
    Bz: ["𝐳"],
    C: ["∁"],
    Cap: ["⋒"],
    Chi: ["Χ"],
    Cup: ["⋓"],
    DH: ["Ð"],
    Dd: ["ⅅ"],
    Dei: ["Ϯ"],
    Delta: ["Δ"],
    Diamond: ["◇"],
    Digamma: ["Ϝ"],
    Downarrow: ["⇓"],
    Epsilon: ["Ε"],
    Eta: ["Η"],
    "F!": ["！"],
    "F#": ["＃"],
    F$: ["＄"],
    "F%": ["％"],
    "F&": ["＆"],
    "F'": ["＇"],
    "F(": ["（"],
    "F((": ["｟"],
    "F)": ["）"],
    "F))": ["｠"],
    "F*": ["＊"],
    "F+": ["＋"],
    "F,": ["，"],
    "F-": ["－"],
    "F.": ["．"],
    "F/": ["／"],
    F0: ["０"],
    F1: ["１"],
    F2: ["２"],
    F3: ["３"],
    F4: ["４"],
    F5: ["５"],
    F6: ["６"],
    F7: ["７"],
    F8: ["８"],
    F9: ["９"],
    "F:": ["："],
    "F;": ["；"],
    "F<": ["＜"],
    "F=": ["＝"],
    "F>": ["＞"],
    "F?": ["？"],
    "F@": ["＠"],
    FA: ["Ａ"],
    FB: ["Ｂ"],
    FC: ["Ｃ"],
    FD: ["Ｄ"],
    FE: ["Ｅ"],
    FF: ["Ｆ"],
    FG: ["Ｇ"],
    FH: ["Ｈ"],
    FI: ["Ｉ"],
    FJ: ["Ｊ"],
    FK: ["Ｋ"],
    FL: ["Ｌ"],
    FM: ["Ｍ"],
    FN: ["Ｎ"],
    FO: ["Ｏ"],
    FP: ["Ｐ"],
    FQ: ["Ｑ"],
    FR: ["Ｒ"],
    FS: ["Ｓ"],
    FT: ["Ｔ"],
    FU: ["Ｕ"],
    FV: ["Ｖ"],
    FW: ["Ｗ"],
    FX: ["Ｘ"],
    FY: ["Ｙ"],
    FZ: ["Ｚ"],
    "F[": ["［"],
    "F\\": ["＼"],
    "F]": ["］"],
    "F_": ["＿"],
    Fa: ["ａ"],
    Fb: ["ｂ"],
    Fc: ["ｃ"],
    Fd: ["ｄ"],
    Fe: ["ｅ"],
    Fei: ["Ϥ"],
    Ff: ["ｆ"],
    Fg: ["ｇ"],
    Fh: ["ｈ"],
    Fi: ["ｉ"],
    Fj: ["ｊ"],
    Fk: ["ｋ"],
    Fl: ["ｌ"],
    Fm: ["ｍ"],
    Fn: ["ｎ"],
    Fneg: ["￢"],
    Fo: ["ｏ"],
    Fp: ["ｐ"],
    Fq: ["ｑ"],
    Fr: ["ｒ"],
    Frowny: ["☹"],
    Fs: ["ｓ"],
    Ft: ["ｔ"],
    Fu: ["ｕ"],
    Fv: ["ｖ"],
    Fw: ["ｗ"],
    Fx: ["ｘ"],
    Fy: ["ｙ"],
    Fz: ["ｚ"],
    "F{": ["｛"],
    "F|": ["｜"],
    "F}": ["｝"],
    "F~": ["～"],
    GA: ["Α"],
    GB: ["Β"],
    GC: ["Χ"],
    GD: ["Δ"],
    GE: ["Ε"],
    GF: ["Φ"],
    GG: ["Γ"],
    GH: ["Η"],
    GI: ["Ι"],
    GK: ["Κ"],
    GL: ["Λ"],
    GM: ["Μ"],
    GN: ["Ν"],
    GO: ["Ω"],
    GP: ["Ψ"],
    GR: ["Ρ"],
    GS: ["Σ"],
    GT: ["Τ"],
    GTH: ["Θ"],
    GU: ["Υ"],
    GX: ["Ξ"],
    GZ: ["Ζ"],
    Ga: ["α"],
    Gamma: ["Γ"],
    Gangia: ["Ϫ"],
    Gb: ["β"],
    Gc: ["χ"],
    Gd: ["δ"],
    Ge: ["ε"],
    Gf: ["φ"],
    Gg: ["γ"],
    Gh: ["η"],
    Gi: ["ι"],
    Gk: ["κ"],
    Gl: ["λ"],
    "Gl-": ["ƛ"],
    Glb: ["⨅"],
    Gm: ["μ"],
    Gn: ["ν"],
    Go: ["ω"],
    Gp: ["ψ"],
    Gr: ["ρ"],
    Gs: ["σ"],
    Gt: ["τ"],
    Gth: ["θ"],
    Gu: ["υ"],
    Gx: ["ξ"],
    Gz: ["ζ"],
    H: ["̋"],
    HO: ["Ő"],
    HU: ["Ű"],
    Heta: ["Ͱ"],
    Ho: ["ő"],
    Hori: ["Ϩ"],
    Hu: ["ű"],
    "H{O}": ["Ő"],
    "H{U}": ["Ű"],
    "H{o}": ["ő"],
    "H{u}": ["ű"],
    "H{}": ["˝"],
    I: ["⋂"],
    Im: ["ℑ"],
    Iota: ["Ι"],
    Join: ["⋈"],
    Kappa: ["Κ"],
    Khei: ["Ϧ"],
    Koppa: ["Ϟ"],
    L: ["Ł"],
    Lambda: ["Λ"],
    Lamda: ["Λ"],
    Leftarrow: ["⇐"],
    Leftrightarrow: ["⇔"],
    Letter: ["✉"],
    Ll: ["⋘"],
    Lleftarrow: ["⇚"],
    Longleftarrow: ["⇐"],
    Longleftrightarrow: ["⇔"],
    Longrightarrow: ["⇒"],
    Lsh: ["↰"],
    Lub: ["⨆"],
    MCA: ["𝓐"],
    MCB: ["𝓑"],
    MCC: ["𝓒"],
    MCD: ["𝓓"],
    MCE: ["𝓔"],
    MCF: ["𝓕"],
    MCG: ["𝓖"],
    MCH: ["𝓗"],
    MCI: ["𝓘"],
    MCJ: ["𝓙"],
    MCK: ["𝓚"],
    MCL: ["𝓛"],
    MCM: ["𝓜"],
    MCN: ["𝓝"],
    MCO: ["𝓞"],
    MCP: ["𝓟"],
    MCQ: ["𝓠"],
    MCR: ["𝓡"],
    MCS: ["𝓢"],
    MCT: ["𝓣"],
    MCU: ["𝓤"],
    MCV: ["𝓥"],
    MCW: ["𝓦"],
    MCX: ["𝓧"],
    MCY: ["𝓨"],
    MCZ: ["𝓩"],
    MCa: ["𝓪"],
    MCb: ["𝓫"],
    MCc: ["𝓬"],
    MCd: ["𝓭"],
    MCe: ["𝓮"],
    MCf: ["𝓯"],
    MCg: ["𝓰"],
    MCh: ["𝓱"],
    MCi: ["𝓲"],
    MCj: ["𝓳"],
    MCk: ["𝓴"],
    MCl: ["𝓵"],
    MCm: ["𝓶"],
    MCn: ["𝓷"],
    MCo: ["𝓸"],
    MCp: ["𝓹"],
    MCq: ["𝓺"],
    MCr: ["𝓻"],
    MCs: ["𝓼"],
    MCt: ["𝓽"],
    MCu: ["𝓾"],
    MCv: ["𝓿"],
    MCw: ["𝔀"],
    MCx: ["𝔁"],
    MCy: ["𝔂"],
    MCz: ["𝔃"],
    MIA: ["𝑨"],
    MIB: ["𝑩"],
    MIC: ["𝑪"],
    MID: ["𝑫"],
    MIE: ["𝑬"],
    MIF: ["𝑭"],
    MIG: ["𝑮"],
    MIH: ["𝑯"],
    MII: ["𝑰"],
    MIJ: ["𝑱"],
    MIK: ["𝑲"],
    MIL: ["𝑳"],
    MIM: ["𝑴"],
    MIN: ["𝑵"],
    MIO: ["𝑶"],
    MIP: ["𝑷"],
    MIQ: ["𝑸"],
    MIR: ["𝑹"],
    MIS: ["𝑺"],
    MIT: ["𝑻"],
    MIU: ["𝑼"],
    MIV: ["𝑽"],
    MIW: ["𝑾"],
    MIX: ["𝑿"],
    MIY: ["𝒀"],
    MIZ: ["𝒁"],
    MIa: ["𝒂"],
    MIb: ["𝒃"],
    MIc: ["𝒄"],
    MId: ["𝒅"],
    MIe: ["𝒆"],
    MIf: ["𝒇"],
    MIg: ["𝒈"],
    MIh: ["𝒉"],
    MIi: ["𝒊"],
    MIj: ["𝒋"],
    MIk: ["𝒌"],
    MIl: ["𝒍"],
    MIm: ["𝒎"],
    MIn: ["𝒏"],
    MIo: ["𝒐"],
    MIp: ["𝒑"],
    MIq: ["𝒒"],
    MIr: ["𝒓"],
    MIs: ["𝒔"],
    MIt: ["𝒕"],
    MIu: ["𝒖"],
    MIv: ["𝒗"],
    MIw: ["𝒘"],
    MIx: ["𝒙"],
    MIy: ["𝒚"],
    MIz: ["𝒛"],
    McA: ["𝒜"],
    McB: ["ℬ"],
    McC: ["𝒞"],
    McD: ["𝒟"],
    McE: ["ℰ"],
    McF: ["ℱ"],
    McG: ["𝒢"],
    McH: ["ℋ"],
    McI: ["ℐ"],
    McJ: ["𝒥"],
    McK: ["𝒦"],
    McL: ["ℒ"],
    McM: ["ℳ"],
    McN: ["𝒩"],
    McO: ["𝒪"],
    McP: ["𝒫"],
    McQ: ["𝒬"],
    McR: ["ℛ"],
    McS: ["𝒮"],
    McT: ["𝒯"],
    McU: ["𝒰"],
    McV: ["𝒱"],
    McW: ["𝒲"],
    McX: ["𝒳"],
    McY: ["𝒴"],
    McZ: ["𝒵"],
    Mca: ["𝒶"],
    Mcb: ["𝒷"],
    Mcc: ["𝒸"],
    Mcd: ["𝒹"],
    Mce: ["ℯ"],
    Mcf: ["𝒻"],
    Mcg: ["ℊ"],
    Mch: ["𝒽"],
    Mci: ["𝒾"],
    Mcj: ["𝒿"],
    Mck: ["𝓀"],
    Mcl: ["𝓁"],
    Mcm: ["𝓂"],
    Mcn: ["𝓃"],
    Mco: ["ℴ"],
    Mcp: ["𝓅"],
    Mcq: ["𝓆"],
    Mcr: ["𝓇"],
    Mcs: ["𝓈"],
    Mct: ["𝓉"],
    Mcu: ["𝓊"],
    Mcv: ["𝓋"],
    Mcw: ["𝓌"],
    Mcx: ["𝓍"],
    Mcy: ["𝓎"],
    Mcz: ["𝓏"],
    MfA: ["𝔄"],
    MfB: ["𝔅"],
    MfC: ["ℭ"],
    MfD: ["𝔇"],
    MfE: ["𝔈"],
    MfF: ["𝔉"],
    MfG: ["𝔊"],
    MfH: ["ℌ"],
    MfI: ["ℑ"],
    MfJ: ["𝔍"],
    MfK: ["𝔎"],
    MfL: ["𝔏"],
    MfM: ["𝔐"],
    MfN: ["𝔑"],
    MfO: ["𝔒"],
    MfP: ["𝔓"],
    MfQ: ["𝔔"],
    MfR: ["ℜ"],
    MfS: ["𝔖"],
    MfT: ["𝔗"],
    MfU: ["𝔘"],
    MfV: ["𝔙"],
    MfW: ["𝔚"],
    MfX: ["𝔛"],
    MfY: ["𝔜"],
    MfZ: ["ℨ"],
    Mfa: ["𝔞"],
    Mfb: ["𝔟"],
    Mfc: ["𝔠"],
    Mfd: ["𝔡"],
    Mfe: ["𝔢"],
    Mff: ["𝔣"],
    Mfg: ["𝔤"],
    Mfh: ["𝔥"],
    Mfi: ["𝔦"],
    Mfj: ["𝔧"],
    Mfk: ["𝔨"],
    Mfl: ["𝔩"],
    Mfm: ["𝔪"],
    Mfn: ["𝔫"],
    Mfo: ["𝔬"],
    Mfp: ["𝔭"],
    Mfq: ["𝔮"],
    Mfr: ["𝔯"],
    Mfs: ["𝔰"],
    Mft: ["𝔱"],
    Mfu: ["𝔲"],
    Mfv: ["𝔳"],
    Mfw: ["𝔴"],
    Mfx: ["𝔵"],
    Mfy: ["𝔶"],
    Mfz: ["𝔷"],
    MiA: ["𝐴"],
    MiB: ["𝐵"],
    MiC: ["𝐶"],
    MiD: ["𝐷"],
    MiE: ["𝐸"],
    MiF: ["𝐹"],
    MiG: ["𝐺"],
    MiH: ["𝐻"],
    MiI: ["𝐼"],
    MiJ: ["𝐽"],
    MiK: ["𝐾"],
    MiL: ["𝐿"],
    MiM: ["𝑀"],
    MiN: ["𝑁"],
    MiO: ["𝑂"],
    MiP: ["𝑃"],
    MiQ: ["𝑄"],
    MiR: ["𝑅"],
    MiS: ["𝑆"],
    MiT: ["𝑇"],
    MiU: ["𝑈"],
    MiV: ["𝑉"],
    MiW: ["𝑊"],
    MiX: ["𝑋"],
    MiY: ["𝑌"],
    MiZ: ["𝑍"],
    Mia: ["𝑎"],
    Mib: ["𝑏"],
    Mic: ["𝑐"],
    Mid: ["𝑑"],
    Mie: ["𝑒"],
    Mif: ["𝑓"],
    Mig: ["𝑔"],
    Mih: ["ℎ"],
    Mii: ["𝑖"],
    Mij: ["𝑗"],
    Mik: ["𝑘"],
    Mil: ["𝑙"],
    Mim: ["𝑚"],
    Min: ["𝑛"],
    Mio: ["𝑜"],
    Mip: ["𝑝"],
    Miq: ["𝑞"],
    Mir: ["𝑟"],
    Mis: ["𝑠"],
    Mit: ["𝑡"],
    Miu: ["𝑢"],
    Miv: ["𝑣"],
    Miw: ["𝑤"],
    Mix: ["𝑥"],
    Miy: ["𝑦"],
    Miz: ["𝑧"],
    Mu: ["Μ"],
    Nu: ["Ν"],
    O: ["Ø"],
    "O*": ["⍟"],
    "O+": ["⨁"],
    "O.": ["⨀"],
    OE: ["Œ"],
    Omega: ["Ω"],
    Omicron: ["Ο"],
    Or: ["⋁"],
    Ox: ["⨂"],
    P: ["¶"],
    Phi: ["Φ"],
    Pi: ["Π"],
    Psi: ["Ψ"],
    Re: ["ℜ"],
    Rho: ["Ρ"],
    Rightarrow: ["⇒"],
    Rrightarrow: ["⇛"],
    Rsh: ["↱"],
    S: ["§"],
    Sampi: ["Ϡ"],
    San: ["Ϻ"],
    Shei: ["Ϣ"],
    Shima: ["Ϭ"],
    Sho: ["Ϸ"],
    Sigma: ["Σ"],
    Smiley: ["☺"],
    Stigma: ["Ϛ"],
    Subset: ["⋐"],
    Supset: ["⋑"],
    T: [
        "◀",
        "◁",
        "▶",
        "▷",
        "▲",
        "△",
        "▼",
        "▽",
        "◬",
        "◭",
        "◮"
    ],
    TH: ["Þ"],
    Tau: ["Τ"],
    Tb: [
        "◀",
        "▶",
        "▲",
        "▼"
    ],
    Theta: ["Θ"],
    Top: ["⟙"],
    Tw: [
        "◁",
        "▷",
        "△",
        "▽"
    ],
    "U+": ["⨄"],
    "U.": ["⨃"],
    Un: ["⋃"],
    Uo: ["ő"],
    Uparrow: ["⇑"],
    Updownarrow: ["⇕"],
    Upsilon: ["Υ"],
    "U{o}": ["ő"],
    Vdash: ["⊩"],
    Vert: ["‖"],
    Vvdash: ["⊪"],
    Xi: ["Ξ"],
    Yot: ["Ϳ"],
    Zeta: ["Ζ"],
    "[[": ["⟦"],
    "\\": ["\\"],
    "]]": ["⟧"],
    "^": ["̂"],
    "^(": ["⁽"],
    "^)": ["⁾"],
    "^+": ["⁺"],
    "^-": ["⁻"],
    "^--": ["̅", "̿"],
    "^.": [
        "̇",
        "̈",
        "⃛",
        "⃜"
    ],
    "^0": ["⁰"],
    "^1": ["¹"],
    "^2": ["²"],
    "^3": ["³"],
    "^4": ["⁴"],
    "^5": ["⁵"],
    "^6": ["⁶"],
    "^7": ["⁷"],
    "^8": ["⁸"],
    "^9": ["⁹"],
    "^=": ["⁼"],
    "^A": ["Â", "ᴬ"],
    "^B": ["ᴮ"],
    "^C": ["Ĉ", "ꟲ"],
    "^D": ["ᴰ"],
    "^E": ["Ê", "ᴱ"],
    "^F": ["ꟳ"],
    "^G": ["Ĝ", "ᴳ"],
    "^GF": ["ᶲ"],
    "^Ga": ["ᵅ"],
    "^Gb": ["ᵝ"],
    "^Gc": ["ᵡ"],
    "^Gd": ["ᵟ"],
    "^Ge": ["ᵋ"],
    "^Gf": ["ᵠ"],
    "^Gg": ["ᵞ"],
    "^Gi": ["ᶥ"],
    "^Gth": ["ᶿ"],
    "^H": ["Ĥ", "ᴴ"],
    "^I": ["Î", "ᴵ"],
    "^J": ["Ĵ", "ᴶ"],
    "^K": ["ᴷ"],
    "^L": ["ᴸ"],
    "^M": ["ᴹ"],
    "^N": ["ᴺ"],
    "^O": ["Ô", "ᴼ"],
    "^P": ["ᴾ"],
    "^Q": ["ꟴ"],
    "^R": ["ᴿ"],
    "^S": ["Ŝ"],
    "^T": ["ᵀ"],
    "^U": ["Û", "ᵁ"],
    "^V": ["ⱽ"],
    "^W": ["Ŵ", "ᵂ"],
    "^Y": ["Ŷ"],
    "^Z": ["Ẑ"],
    "^\\Ae": ["ᴭ"],
    "^\\Barred B": ["ᴯ"],
    "^\\H With Stroke": ["ꟸ"],
    "^\\Ou": ["ᴽ"],
    "^\\Reversed E": ["ᴲ"],
    "^\\Reversed N": ["ᴻ"],
    "^\\ae": ["𐞃"],
    "^\\ain": ["ᵜ"],
    "^\\alpha": ["ᵅ"],
    "^\\b with hook": ["𐞅"],
    "^\\barred o": ["ᶱ"],
    "^\\beta": ["ᵝ"],
    "^\\bottom half o": ["ᵕ"],
    "^\\c with curl": ["ᶝ"],
    "^\\capital aa": ["𐞀"],
    "^\\capital b": ["𐞄"],
    "^\\capital g": ["𐞒"],
    "^\\capital g with hook": ["𐞔"],
    "^\\capital h": ["𐞖"],
    "^\\capital i": ["ᶦ"],
    "^\\capital i with stroke": ["ᶧ"],
    "^\\capital inverted r": ["ʶ"],
    "^\\capital l": ["ᶫ"],
    "^\\capital l with belt": ["𐞜"],
    "^\\capital n": ["ᶰ"],
    "^\\capital oe": ["𐞣"],
    "^\\capital r": ["𐞪"],
    "^\\capital u": ["ᶸ"],
    "^\\capital y": ["𐞲"],
    "^\\chi": ["ᵡ"],
    "^\\closed omega": ["𐞤"],
    "^\\closed reversed open e": ["𐞏"],
    "^\\d with hook": ["𐞌"],
    "^\\d with hook and tail": ["𐞍"],
    "^\\d with tail": ["𐞋"],
    "^\\delta": ["ᵟ"],
    "^\\dezh digraph": ["𐞊"],
    "^\\dotless j with stroke": ["ᶡ"],
    "^\\dotless j with stroke and hook": ["𐞘"],
    "^\\dz digraph": ["𐞇"],
    "^\\dz digraph with curl": ["𐞉"],
    "^\\dz digraph with retroflex hook": ["𐞈"],
    "^\\eng": ["ᵑ"],
    "^\\esh": ["ᶴ"],
    "^\\eth": ["ᶞ"],
    "^\\ezh": ["ᶾ"],
    "^\\feng digraph": ["𐞐"],
    "^\\g with hook": ["𐞓"],
    "^\\gamma": ["ˠ"],
    "^\\greek gamma": ["ᵞ"],
    "^\\greek phi": ["ᵠ"],
    "^\\h hook": ["ʱ"],
    "^\\h with hook": ["ʱ"],
    "^\\h with stroke": ["𐞕"],
    "^\\heng": ["ꭜ"],
    "^\\heng with hook": ["𐞗"],
    "^\\i with stroke": ["ᶤ"],
    "^\\iota": ["ᶥ"],
    "^\\j with crossed-tail": ["ᶨ"],
    "^\\l with belt": ["𐞛"],
    "^\\l with inverted lazy s": ["ꭝ"],
    "^\\l with middle tilde": ["ꭞ"],
    "^\\l with palatal hook": ["ᶪ"],
    "^\\l with retroflex hook": ["ᶩ"],
    "^\\l with retroflex hook and belt": ["𐞝"],
    "^\\lezh": ["𐞞"],
    "^\\lezh with retroflex hook": ["𐞟"],
    "^\\ligature oe": ["ꟹ"],
    "^\\ls digraph": ["𐞙"],
    "^\\lz digraph": ["𐞚"],
    "^\\m with hook": ["ᶬ"],
    "^\\n with left hook": ["ᶮ"],
    "^\\n with retroflex hook": ["ᶯ"],
    "^\\o with stroke": ["𐞢"],
    "^\\open e": ["ᵋ"],
    "^\\open o": ["ᵓ"],
    "^\\phi": ["ᶲ"],
    "^\\r with fishhook": ["𐞩"],
    "^\\r with tail": ["𐞨"],
    "^\\rams horn": ["𐞑"],
    "^\\reversed e": ["𐞎"],
    "^\\reversed glottal stop": ["ˤ"],
    "^\\reversed open e": ["ᶟ"],
    "^\\s with curl": ["𐞺"],
    "^\\s with hook": ["ᶳ"],
    "^\\schwa": ["ᵊ"],
    "^\\script g": ["ᶢ"],
    "^\\sideways u": ["ᵙ"],
    "^\\t with palatal hook": ["ᶵ"],
    "^\\t with retroflex hook": ["𐞯"],
    "^\\tc digraph with curl": ["𐞫"],
    "^\\tesh digraph": ["𐞮"],
    "^\\theta": ["ᶿ"],
    "^\\top half o": ["ᵔ"],
    "^\\ts digraph": ["𐞬"],
    "^\\ts digraph with retroflex hook": ["𐞭"],
    "^\\turned a": ["ᵄ"],
    "^\\turned ae": ["ᵆ"],
    "^\\turned alpha": ["ᶛ"],
    "^\\turned h": ["ᶣ"],
    "^\\turned i": ["ᵎ"],
    "^\\turned m": ["ᵚ"],
    "^\\turned m with long leg": ["ᶭ"],
    "^\\turned open e": ["ᵌ"],
    "^\\turned r": ["ʴ"],
    "^\\turned r hook": ["ʵ"],
    "^\\turned r with hook": ["ʵ"],
    "^\\turned r with long leg": ["𐞦"],
    "^\\turned r with long leg and retroflex hook": ["𐞧"],
    "^\\turned v": ["ᶺ"],
    "^\\turned w": ["ꭩ"],
    "^\\turned y": ["𐞠"],
    "^\\turned y with belt": ["𐞡"],
    "^\\u bar": ["ᶶ"],
    "^\\u with left hook": ["ꭟ"],
    "^\\upsilon": ["ᶷ"],
    "^\\v with hook": ["ᶹ"],
    "^\\v with right hook": ["𐞰"],
    "^\\z with curl": ["ᶽ"],
    "^\\z with retroflex hook": ["ᶼ"],
    "^^": [
        "̂",
        "̑",
        "͆"
    ],
    "^a": ["â", "ᵃ"],
    "^a_": ["ª"],
    "^b": ["ᵇ"],
    "^c": ["ĉ", "ᶜ"],
    "^d": ["ᵈ"],
    "^e": ["ê", "ᵉ"],
    "^f": ["ᶠ"],
    "^g": ["ĝ", "ᵍ"],
    "^h": ["ĥ", "ʰ"],
    "^i": ["î", "ⁱ"],
    "^j": ["ĵ", "ʲ"],
    "^k": ["ᵏ"],
    "^l": [
        "⃖",
        "⃐",
        "⃔",
        "ˡ"
    ],
    "^m": ["ᵐ"],
    "^n": ["ⁿ"],
    "^o": ["ô", "ᵒ"],
    "^o_": ["º"],
    "^p": ["ᵖ"],
    "^q": ["𐞥"],
    "^r": [
        "⃗",
        "⃑",
        "⃕",
        "ʳ"
    ],
    "^s": ["ŝ", "ˢ"],
    "^t": ["ᵗ"],
    "^u": ["û", "ᵘ"],
    "^v": [
        "̌",
        "̆",
        "ᵛ"
    ],
    "^w": ["ŵ", "ʷ"],
    "^x": ["ˣ"],
    "^y": ["ŷ", "ʸ"],
    "^z": ["ᶻ", "ẑ"],
    "^{A}": ["Â"],
    "^{C}": ["Ĉ"],
    "^{E}": ["Ê"],
    "^{G}": ["Ĝ"],
    "^{H}": ["Ĥ"],
    "^{I}": ["Î"],
    "^{J}": ["Ĵ"],
    "^{O}": ["Ô"],
    "^{SM}": ["℠"],
    "^{S}": ["Ŝ"],
    "^{TEL}": ["℡"],
    "^{TM}": ["™"],
    "^{U}": ["Û"],
    "^{W}": ["Ŵ"],
    "^{Y}": ["Ŷ"],
    "^{Z}": ["Ẑ"],
    "^{\\j}": ["ĵ"],
    "^{a}": ["â"],
    "^{c}": ["ĉ"],
    "^{e}": ["ê"],
    "^{g}": ["ĝ"],
    "^{h}": ["ĥ"],
    "^{i}": ["î"],
    "^{j}": ["ĵ"],
    "^{o}": ["ô"],
    "^{s}": ["ŝ"],
    "^{u}": ["û"],
    "^{w}": ["ŵ"],
    "^{y}": ["ŷ"],
    "^{z}": ["ẑ"],
    "^~": ["̃", "͌"],
    "_(": ["₍"],
    "_)": ["₎"],
    "_+": ["₊"],
    "_-": ["₋"],
    "_--": ["̲", "̳"],
    "_.": ["̣", "̤"],
    "_0": ["₀"],
    "_1": ["₁"],
    "_2": ["₂"],
    "_3": ["₃"],
    "_4": ["₄"],
    "_5": ["₅"],
    "_6": ["₆"],
    "_7": ["₇"],
    "_8": ["₈"],
    "_9": ["₉"],
    "_=": ["₌"],
    "_Gb": ["ᵦ"],
    "_Gc": ["ᵪ"],
    "_Gf": ["ᵩ"],
    "_Gg": ["ᵧ"],
    _Gr: ["ᵨ"],
    "_^": [
        "̭",
        "̯",
        "̪"
    ],
    "__": ["＿"],
    "_a": ["ₐ"],
    "_e": ["ₑ"],
    "_h": ["ₕ"],
    "_i": ["ᵢ"],
    "_j": ["ⱼ"],
    "_k": ["ₖ"],
    "_l": ["ₗ"],
    "_m": ["ₘ"],
    "_n": ["ₙ"],
    "_o": ["ₒ"],
    "_p": ["ₚ"],
    "_r": ["ᵣ"],
    "_s": ["ₛ"],
    "_t": ["ₜ"],
    "_u": ["ᵤ"],
    "_v": [
        "ᵥ",
        "̬",
        "̮",
        "̺"
    ],
    "_x": ["ₓ"],
    "`": [
        "̀",
        "‵",
        "‶",
        "‷",
        "｀"
    ],
    "`A": ["À"],
    "`E": ["È"],
    "`I": ["Ì"],
    "`N": ["Ǹ"],
    "`O": ["Ò"],
    "`U": ["Ù"],
    "`W": ["Ẁ"],
    "`Y": ["Ỳ"],
    "`a": ["à"],
    "`e": ["è"],
    "`i": ["ì"],
    "`n": ["ǹ"],
    "`o": ["ò"],
    "`u": ["ù"],
    "`w": ["ẁ"],
    "`y": ["ỳ"],
    "`{A}": ["À"],
    "`{E}": ["È"],
    "`{I}": ["Ì"],
    "`{N}": ["Ǹ"],
    "`{O}": ["Ò"],
    "`{U}": ["Ù"],
    "`{W}": ["Ẁ"],
    "`{Y}": ["Ỳ"],
    "`{a}": ["à"],
    "`{e}": ["è"],
    "`{i}": ["ì"],
    "`{n}": ["ǹ"],
    "`{o}": ["ò"],
    "`{u}": ["ù"],
    "`{w}": ["ẁ"],
    "`{y}": ["ỳ"],
    aa: ["å"],
    above: ["┴"],
    ae: ["æ"],
    afghani: ["؋"],
    aleph: ["ℵ"],
    all: ["∀"],
    alpha: ["α"],
    amalg: ["∐"],
    and: ["∧"],
    "and=": ["≙"],
    angle: [
        "∠",
        "∟",
        "∡",
        "∢",
        "⊾",
        "⊿"
    ],
    angstrom: ["Å"],
    aoint: ["∳"],
    apl: [
        "⌶",
        "⌷",
        "⌸",
        "⌹",
        "⌺",
        "⌻",
        "⌼",
        "⌽",
        "⌾",
        "⌿",
        "⍀",
        "⍁",
        "⍂",
        "⍃",
        "⍄",
        "⍅",
        "⍆",
        "⍇",
        "⍈",
        "⍉",
        "⍊",
        "⍋",
        "⍌",
        "⍍",
        "⍎",
        "⍏",
        "⍐",
        "⍑",
        "⍒",
        "⍓",
        "⍔",
        "⍕",
        "⍖",
        "⍗",
        "⍘",
        "⍙",
        "⍚",
        "⍛",
        "⍜",
        "⍝",
        "⍞",
        "⍟",
        "⍠",
        "⍡",
        "⍢",
        "⍣",
        "⍤",
        "⍥",
        "⍦",
        "⍧",
        "⍨",
        "⍩",
        "⍪",
        "⍫",
        "⍬",
        "⍭",
        "⍮",
        "⍯",
        "⍰",
        "⍱",
        "⍲",
        "⍳",
        "⍴",
        "⍵",
        "⍶",
        "⍷",
        "⍸",
        "⍹",
        "⍺",
        "⎕"
    ],
    approx: ["≈"],
    approxeq: ["≊"],
    asmash: ["⬆"],
    ast: ["∗"],
    asterisk: [
        "⁎",
        "⁑",
        "⁂",
        "✢",
        "✣",
        "✤",
        "✥",
        "✱",
        "✲",
        "✳",
        "✺",
        "✻",
        "✼",
        "✽",
        "❃",
        "❉",
        "❊",
        "❋",
        "＊"
    ],
    asymp: ["≍"],
    at: [
        "@",
        "﹫",
        "＠"
    ],
    atop: ["¦"],
    austral: ["₳"],
    b: ["̱", "♭"],
    "b*": ["⧆"],
    "b+": ["⊞"],
    "b-": ["⊟"],
    "b.": ["⊡"],
    "b/": ["⧄"],
    b0: ["𝟘"],
    b1: ["𝟙"],
    b2: ["𝟚"],
    b3: ["𝟛"],
    b4: ["𝟜"],
    b5: ["𝟝"],
    b6: ["𝟞"],
    b7: ["𝟟"],
    b8: ["𝟠"],
    b9: ["𝟡"],
    bA: ["𝔸"],
    bB: ["𝔹"],
    bC: ["ℂ"],
    bD: ["𝔻"],
    bE: ["𝔼"],
    bF: ["𝔽"],
    bG: ["𝔾"],
    bGG: ["ℾ"],
    bGP: ["ℿ"],
    bGS: ["⅀"],
    bGg: ["ℽ"],
    bGp: ["ℼ"],
    bH: ["ℍ"],
    bI: ["𝕀"],
    bJ: ["𝕁"],
    bK: ["𝕂"],
    bL: ["𝕃"],
    bM: ["𝕄"],
    bN: ["ℕ"],
    bO: ["𝕆"],
    bP: ["ℙ"],
    bQ: ["ℚ"],
    bR: ["ℝ"],
    bS: ["𝕊"],
    bT: ["𝕋"],
    bU: ["𝕌"],
    bV: ["𝕍"],
    bW: ["𝕎"],
    bX: ["𝕏"],
    bY: ["𝕐"],
    bZ: ["ℤ"],
    "b\\": ["⧅"],
    ba: ["𝕒"],
    backcong: ["≌"],
    backepsilon: ["∍"],
    backprime: ["‵"],
    backsim: ["∽"],
    backsimeq: ["⋍"],
    backslash: ["\\"],
    barwedge: ["⊼"],
    bb: ["𝕓", "𝄫"],
    bbot: ["⫫"],
    bc: ["𝕔"],
    bd: ["𝕕"],
    be: ["𝕖"],
    because: ["∵"],
    begin: ["〖"],
    below: ["┬"],
    beta: ["β"],
    beth: ["ℶ"],
    between: ["≬"],
    bf: ["𝕗"],
    bg: ["𝕘"],
    bh: ["𝕙"],
    bi: ["𝕚"],
    bigcap: ["⋂"],
    bigcirc: ["◯"],
    bigcup: ["⋃"],
    bigodot: ["⨀"],
    bigoplus: ["⨁"],
    bigotimes: ["⨂"],
    bigsqcup: ["⨆"],
    bigstar: ["★"],
    bigtriangledown: ["▽"],
    bigtriangleup: ["△"],
    biguplus: ["⨄"],
    bigvee: ["⋁"],
    bigwedge: ["⋀"],
    biohazard: ["☣"],
    bitcoin: ["₿"],
    bj: ["𝕛"],
    bk: ["𝕜"],
    bl: ["𝕝"],
    blacklozenge: ["✦"],
    blacksmiley: ["☻"],
    blacksquare: ["▪"],
    blacktriangle: ["▴"],
    blacktriangledown: ["▾"],
    blacktriangleleft: ["◂"],
    blacktriangleright: ["▸"],
    bm: ["𝕞"],
    bn: ["𝕟"],
    bo: ["⧇", "𝕠"],
    bot: ["⊥"],
    bowtie: ["⋈"],
    "box'": ["⍞"],
    "box/": ["⍁"],
    "box:": ["⍠"],
    "box<": ["⍃"],
    "box=": ["⌸"],
    "box>": ["⍄"],
    "box?": ["⍰"],
    boxO: ["⌼"],
    "box\\": ["⍂"],
    boxcircle: ["⌼"],
    boxcomp: ["⌻"],
    boxd: ["⍗"],
    boxdelta: ["⍍"],
    boxdi: ["⌺"],
    boxdiv: ["⌹"],
    boxeq: ["⌸"],
    boxeqn: ["⍯"],
    boxl: ["⍇"],
    boxminus: ["⊟"],
    boxnabla: ["⍔"],
    boxneq: ["⍯"],
    boxo: ["⌻"],
    boxplus: ["⊞"],
    boxr: ["⍈"],
    boxtimes: ["⊠"],
    boxu: ["⍐"],
    boxvee: ["⍌"],
    boxwedge: ["⍓"],
    bp: ["𝕡"],
    bq: ["𝕢"],
    br: ["𝕣"],
    bra: ["⟨"],
    brokenbar: ["¦"],
    bs: ["𝕤"],
    bsq: ["⧈"],
    bt: ["𝕥"],
    btop: ["⫪"],
    bu: [
        "𝕦",
        "•",
        "◦",
        "‣",
        "⁌",
        "⁍"
    ],
    bub: ["•"],
    bumpeq: ["≏"],
    but: ["‣"],
    buw: ["◦"],
    bv: ["𝕧"],
    bw: ["𝕨"],
    bx: ["⊠", "𝕩"],
    by: ["𝕪"],
    bz: ["𝕫"],
    c: [
        "̧",
        "⌜",
        "⌝",
        "⌞",
        "⌟",
        "⌈",
        "⌉",
        "⌊",
        "⌋"
    ],
    cC: ["Ç"],
    cD: ["Ḑ"],
    cE: ["Ȩ"],
    cG: ["Ģ"],
    cH: ["Ḩ"],
    cK: ["Ķ"],
    cL: ["Ļ"],
    cN: ["Ņ"],
    cR: ["Ŗ"],
    cS: ["Ş"],
    cT: ["Ţ"],
    cap: ["∩"],
    caution: ["☡"],
    cc: ["ç"],
    cd: ["ḑ"],
    cdot: ["·"],
    cdots: ["⋯"],
    ce: ["ȩ"],
    cedi: ["₵"],
    celsius: ["℃"],
    cent: ["¢"],
    centerdot: ["·"],
    cg: ["ģ"],
    ch: ["ḩ"],
    checkmark: ["✓"],
    chi: ["χ"],
    ci: [
        "●",
        "○",
        "◎",
        "◌",
        "◯",
        "◍",
        "◐",
        "◑",
        "◒",
        "◓",
        "◔",
        "◕",
        "◖",
        "◗",
        "◠",
        "◡",
        "◴",
        "◵",
        "◶",
        "◷",
        "⚆",
        "⚇",
        "⚈",
        "⚉"
    ],
    "ci.": ["◎"],
    "ci..": ["◌"],
    ciO: ["◯"],
    cib: ["●"],
    circ: ["∘"],
    circeq: ["≗"],
    circlearrowleft: ["↺"],
    circlearrowright: ["↻"],
    circledR: ["®"],
    circledS: ["Ⓢ"],
    circledast: ["⊛"],
    circledcirc: ["⊚"],
    circleddash: ["⊝"],
    ciw: ["○"],
    ck: ["ķ"],
    cl: [
        "ļ",
        "⌞",
        "⌟",
        "⌊",
        "⌋"
    ],
    clL: ["⌊"],
    clR: ["⌋"],
    cll: ["⌞"],
    close: ["┤"],
    clr: ["⌟"],
    clubsuit: ["♣"],
    cn: ["ņ"],
    coint: ["∲"],
    colon: ["₡"],
    coloneq: ["≔"],
    comp: ["∘"],
    complement: ["∁"],
    cong: ["≅"],
    construction: ["🚧"],
    coprod: ["∐"],
    copyright: ["©"],
    cr: ["ŗ"],
    crossmark: ["✗"],
    cruzeiro: ["₢"],
    cs: ["ş"],
    ct: ["ţ"],
    cu: [
        "⌜",
        "⌝",
        "⌈",
        "⌉"
    ],
    cuL: ["⌈"],
    cuR: ["⌉"],
    cul: ["⌜"],
    cup: ["∪"],
    cur: ["⌝"],
    curlyeqprec: ["⋞"],
    curlyeqsucc: ["⋟"],
    curlypreceq: ["≼"],
    curlyvee: ["⋎"],
    curlywedge: ["⋏"],
    currency: ["¤"],
    curvearrowleft: ["↶"],
    curvearrowright: ["↷"],
    "c{C}": ["Ç"],
    "c{D}": ["Ḑ"],
    "c{E}": ["Ȩ"],
    "c{G}": ["Ģ"],
    "c{H}": ["Ḩ"],
    "c{K}": ["Ķ"],
    "c{L}": ["Ļ"],
    "c{N}": ["Ņ"],
    "c{R}": ["Ŗ"],
    "c{S}": ["Ş"],
    "c{T}": ["Ţ"],
    "c{c}": ["ç"],
    "c{d}": ["ḑ"],
    "c{e}": ["ȩ"],
    "c{g}": ["ģ"],
    "c{h}": ["ḩ"],
    "c{k}": ["ķ"],
    "c{l}": ["ļ"],
    "c{n}": ["ņ"],
    "c{r}": ["ŗ"],
    "c{s}": ["ş"],
    "c{t}": ["ţ"],
    "c{}": ["¸"],
    d: [
        "̣",
        "↓",
        "⇓",
        "⤋",
        "⟱",
        "⇊",
        "⇵",
        "↧",
        "⇩",
        "↡",
        "⇃",
        "⇂",
        "⇣",
        "⇟",
        "↵",
        "↲",
        "↳",
        "➥",
        "↯"
    ],
    "d-": ["↓"],
    "d-2": ["⇊"],
    "d-u-": ["⇵"],
    "d-|": ["↧"],
    "d=": ["⇓"],
    "d==": ["⟱"],
    dag: ["†"],
    dagger: ["†"],
    daleth: ["ℸ"],
    dashv: ["⊣"],
    dd: ["ⅆ"],
    "dd-": ["↡"],
    ddag: ["‡"],
    ddagger: ["‡"],
    ddddot: ["⃜"],
    dddot: ["⃛"],
    ddots: ["⋱"],
    "def=": ["≝"],
    defs: ["≙"],
    degree: ["°"],
    dei: ["ϯ"],
    delta: ["δ"],
    dh: ["ð"],
    di: [
        "◆",
        "◇",
        "◈"
    ],
    "di.": ["◈"],
    diameter: ["⌀"],
    diamond: ["⋄"],
    diamondsuit: ["♢"],
    dib: ["◆"],
    die: [
        "⚀",
        "⚁",
        "⚂",
        "⚃",
        "⚄",
        "⚅"
    ],
    digamma: ["ϝ"],
    din: ["⫙"],
    div: ["÷"],
    divideontimes: ["⋇"],
    division: ["÷"],
    diw: ["◇"],
    dl: ["↙", "⇙"],
    "dl-": ["↙"],
    "dl=": ["⇙"],
    dong: ["₫"],
    doteq: ["≐"],
    doteqdot: ["≑"],
    dotplus: ["∔"],
    dotsquare: ["⊡"],
    downarrow: ["↓"],
    downdownarrows: ["⇊"],
    downleftharpoon: ["⇃"],
    downrightharpoon: ["⇂"],
    dr: [
        "↘",
        "⇘",
        "⇲",
        "➴",
        "➷",
        "➘"
    ],
    "dr-": ["↘"],
    "dr=": ["⇘"],
    drachma: ["₯"],
    dsmash: ["⬇"],
    dz: ["↯"],
    "d{A}": ["Ạ"],
    "d{B}": ["Ḅ"],
    "d{D}": ["Ḍ"],
    "d{E}": ["Ẹ"],
    "d{H}": ["Ḥ"],
    "d{I}": ["Ị"],
    "d{K}": ["Ḳ"],
    "d{L}": ["Ḷ"],
    "d{M}": ["Ṃ"],
    "d{N}": ["Ṇ"],
    "d{O}": ["Ọ"],
    "d{R}": ["Ṛ"],
    "d{S}": ["Ṣ"],
    "d{T}": ["Ṭ"],
    "d{U}": ["Ụ"],
    "d{V}": ["Ṿ"],
    "d{W}": ["Ẉ"],
    "d{Y}": ["Ỵ"],
    "d{Z}": ["Ẓ"],
    "d{a}": ["ạ"],
    "d{b}": ["ḅ"],
    "d{d}": ["ḍ"],
    "d{e}": ["ẹ"],
    "d{h}": ["ḥ"],
    "d{i}": ["ị"],
    "d{k}": ["ḳ"],
    "d{l}": ["ḷ"],
    "d{m}": ["ṃ"],
    "d{n}": ["ṇ"],
    "d{o}": ["ọ"],
    "d{r}": ["ṛ"],
    "d{s}": ["ṣ"],
    "d{t}": ["ṭ"],
    "d{u}": ["ụ"],
    "d{v}": ["ṿ"],
    "d{w}": ["ẉ"],
    "d{y}": ["ỵ"],
    "d{z}": ["ẓ"],
    ee: ["ⅇ"],
    ell: ["ℓ"],
    em: ["—"],
    emptyset: ["∅"],
    en: ["–"],
    end: ["〗"],
    entails: [
        "⊢",
        "⊣",
        "⊤",
        "⊥",
        "⊦",
        "⊧",
        "⊨",
        "⊩",
        "⊪",
        "⊫",
        "⊬",
        "⊭",
        "⊮",
        "⊯"
    ],
    epsilon: ["ϵ"],
    eq: [
        "=",
        "∼",
        "∽",
        "≈",
        "≋",
        "∻",
        "∾",
        "∿",
        "≀",
        "≃",
        "⋍",
        "≂",
        "≅",
        "≌",
        "≊",
        "≡",
        "≣",
        "≐",
        "≑",
        "≒",
        "≓",
        "≔",
        "≕",
        "≖",
        "≗",
        "≘",
        "≙",
        "≚",
        "≛",
        "≜",
        "≝",
        "≞",
        "≟",
        "≍",
        "≎",
        "≏",
        "≬",
        "⋕",
        "＝"
    ],
    eqarray: ["█"],
    eqcirc: ["≖"],
    eqcolon: ["≕"],
    eqn: [
        "≠",
        "≁",
        "≉",
        "≄",
        "≇",
        "≆",
        "≢",
        "≭"
    ],
    eqslantgtr: ["⋝"],
    eqslantless: ["⋜"],
    equiv: ["≡"],
    esh: ["ʃ"],
    eta: ["η"],
    euro: ["€"],
    ex: ["∃"],
    exists: ["∃"],
    exn: ["∄"],
    facsimile: ["℻"],
    fallingdotseq: ["≒"],
    fei: ["ϥ"],
    female: ["♀"],
    flat: ["♭"],
    flq: ["‹"],
    flqq: ["«"],
    forall: ["∀"],
    frac: [
        "¼",
        "½",
        "¾",
        "⅓",
        "⅔",
        "⅕",
        "⅖",
        "⅗",
        "⅘",
        "⅙",
        "⅚",
        "⅛",
        "⅜",
        "⅝",
        "⅞",
        "⅟"
    ],
    frac1: ["⅟"],
    frac12: ["½"],
    frac13: ["⅓"],
    frac14: ["¼"],
    frac15: ["⅕"],
    frac16: ["⅙"],
    frac18: ["⅛"],
    frac23: ["⅔"],
    frac25: ["⅖"],
    frac34: ["¾"],
    frac35: ["⅗"],
    frac38: ["⅜"],
    frac45: ["⅘"],
    frac56: ["⅚"],
    frac58: ["⅝"],
    frac78: ["⅞"],
    frown: ["⌢"],
    frq: ["›"],
    frqq: ["»"],
    gamma: ["γ"],
    gangia: ["ϫ"],
    ge: ["≥"],
    gen: ["≱"],
    geq: [
        ">",
        "≫",
        "⋙",
        "≥",
        "≧",
        "≳",
        "≷",
        "≻",
        "≽",
        "≿",
        "⊃",
        "⊇",
        "⫈",
        "⫊",
        "⋑",
        "⊐",
        "⊒",
        "⊱",
        "⊳",
        "⊵",
        "⋗",
        "⋛",
        "⋝",
        "⋟",
        "＞"
    ],
    geqn: [
        "≯",
        "≱",
        "≩",
        "≵",
        "⋧",
        "≹",
        "⊁",
        "⋩",
        "⊅",
        "⊉",
        "⊋",
        "⋣",
        "⋥",
        "⋫",
        "⋭",
        "⋡"
    ],
    geqq: ["≧"],
    geqslant: ["≥"],
    gets: ["←"],
    gg: ["≫"],
    ggg: ["⋙"],
    gimel: ["ℷ"],
    glb: ["⊓"],
    glq: ["‚"],
    glqq: ["„"],
    gnapprox: ["⋧"],
    gneq: ["≩"],
    gneqq: ["≩"],
    gnsim: ["⋧"],
    grq: ["‘"],
    grqq: ["“"],
    gtrapprox: ["≳"],
    gtrdot: ["⋗"],
    gtreqless: ["⋛"],
    gtreqqless: ["⋛"],
    gtrless: ["≷"],
    gtrsim: ["≳"],
    guarani: ["₲"],
    gvertneqq: ["≩"],
    hbar: ["ℏ"],
    heartsuit: ["♥"],
    heta: ["ͱ"],
    hookleftarrow: ["↩"],
    hookrightarrow: ["↪"],
    hori: ["ϩ"],
    hphantom: ["⬄"],
    hryvnia: ["₴"],
    hsmash: ["⬌"],
    i: ["ı", "∩"],
    iff: ["⇔"],
    ii: ["ⅈ"],
    iiiint: ["⨌"],
    iiint: ["∭"],
    iint: ["∬"],
    imath: ["ı"],
    "in": ["∈"],
    increment: ["∆"],
    inf: ["∞"],
    infty: ["∞"],
    inn: ["∉"],
    int: ["∫"],
    integral: [
        "∫",
        "∬",
        "∭",
        "∮",
        "∯",
        "∰",
        "∱",
        "∲",
        "∳"
    ],
    intercal: ["⊺"],
    intersection: [
        "∩",
        "⋂",
        "∧",
        "⋀",
        "⋏",
        "⨇",
        "⊓",
        "⨅",
        "⋒",
        "∏",
        "⊼",
        "⨉"
    ],
    iota: ["ι"],
    jj: ["ⅉ"],
    jmath: ["ȷ"],
    join: [
        "⋈",
        "⋉",
        "⋊",
        "⋋",
        "⋌",
        "⨝",
        "⟕",
        "⟖",
        "⟗"
    ],
    k: ["̨"],
    kA: ["Ą"],
    kE: ["Ę"],
    kI: ["Į"],
    kO: ["Ǫ"],
    kU: ["Ų"],
    ka: ["ą"],
    kappa: ["κ"],
    ke: ["ę"],
    kelvin: ["K"],
    khei: ["ϧ"],
    ki: ["į"],
    kip: ["₭"],
    ko: ["ǫ"],
    koppa: ["ϟ"],
    ku: ["ų"],
    "k{A}": ["Ą"],
    "k{E}": ["Ę"],
    "k{I}": ["Į"],
    "k{O}": ["Ǫ"],
    "k{U}": ["Ų"],
    "k{a}": ["ą"],
    "k{e}": ["ę"],
    "k{i}": ["į"],
    "k{o}": ["ǫ"],
    "k{u}": ["ų"],
    "k{}": ["˛"],
    l: [
        "ł",
        "←",
        "⇐",
        "⇚",
        "⭅",
        "⇇",
        "⇆",
        "↤",
        "⇦",
        "↞",
        "↼",
        "↽",
        "⇠",
        "⇺",
        "↜",
        "⇽",
        "⟵",
        "⟸",
        "↚",
        "⇍",
        "⇷",
        "↹",
        "↢",
        "↩",
        "↫",
        "⇋",
        "⇜",
        "⇤",
        "⟻",
        "⟽",
        "⤆",
        "↶",
        "↺",
        "⟲"
    ],
    "l-": ["←"],
    "l--": ["⟵"],
    "l-2": ["⇇"],
    "l->": ["↢"],
    "l-n": ["↚"],
    "l-o": ["⟜"],
    "l-r-": ["⇆"],
    "l-|": ["↤"],
    "l=": ["⇐"],
    "l==": ["⇚"],
    "l=n": ["⇍"],
    lambda: ["λ"],
    lambdabar: ["ƛ"],
    lamda: ["λ"],
    langle: ["⟨"],
    lari: ["₾"],
    lbag: ["⟅"],
    lbrace: ["{"],
    lbrack: ["["],
    lceil: ["⌈"],
    ldata: ["《"],
    ldiv: ["∕"],
    ldots: ["…"],
    ldq: ["“"],
    le: ["≤"],
    leadsto: ["↝"],
    leftarrow: ["←"],
    leftarrowtail: ["↢"],
    leftharpoondown: ["↽"],
    leftharpoonup: ["↼"],
    leftleftarrows: ["⇇"],
    leftrightarrow: ["↔"],
    leftrightarrows: ["⇆"],
    leftrightharpoons: ["⇋"],
    leftrightsquigarrow: ["↭"],
    leftthreetimes: ["⋋"],
    len: ["≰"],
    leq: [
        "<",
        "≪",
        "⋘",
        "≤",
        "≦",
        "≲",
        "≶",
        "≺",
        "≼",
        "≾",
        "⊂",
        "⊆",
        "⫇",
        "⫉",
        "⋐",
        "⊏",
        "⊑",
        "⊰",
        "⊲",
        "⊴",
        "⋖",
        "⋚",
        "⋜",
        "⋞",
        "＜"
    ],
    leqn: [
        "≮",
        "≰",
        "≨",
        "≴",
        "⋦",
        "≸",
        "⊀",
        "⋨",
        "⊄",
        "⊈",
        "⊊",
        "⋢",
        "⋤",
        "⋪",
        "⋬",
        "⋠"
    ],
    leqq: ["≦"],
    leqslant: ["≤"],
    lessapprox: ["≲"],
    lessdot: ["⋖"],
    lesseqgtr: ["⋚"],
    lesseqqgtr: ["⋚"],
    lessgtr: ["≶"],
    lesssim: ["≲"],
    lfloor: ["⌊"],
    lhd: ["◁"],
    lira: ["₤"],
    ll: ["≪"],
    "ll-": ["↞"],
    llbracket: ["〚"],
    llcorner: ["⌞"],
    lll: ["⋘"],
    lnapprox: ["⋦"],
    lneq: ["≨"],
    lneqq: ["≨"],
    lnot: ["¬"],
    lnsim: ["⋦"],
    longleftarrow: ["⟵"],
    longleftrightarrow: ["⟷"],
    longmapsto: ["⟼"],
    longrightarrow: ["⟶"],
    looparrowleft: ["↫"],
    looparrowright: ["↬"],
    lozenge: ["✧"],
    lq: ["‘"],
    lr: [
        "↔",
        "⇔",
        "⇼",
        "↭",
        "⇿",
        "⟷",
        "⟺",
        "↮",
        "⇎",
        "⇹"
    ],
    "lr-": ["↔"],
    "lr--": ["⟷"],
    "lr-n": ["↮"],
    "lr=": ["⇔"],
    "lr=n": ["⇎"],
    lrcorner: ["⌟"],
    "lr~": ["↭"],
    ltimes: ["⋉"],
    lub: ["⊔"],
    lvertneqq: ["≨"],
    "l~": ["↜", "⇜"],
    "m=": ["≞"],
    male: ["♂"],
    maltese: ["✠"],
    manat: ["₼"],
    mapsto: ["↦"],
    "mathscr{I}": ["ℐ"],
    measuredangle: ["∡"],
    member: [
        "∈",
        "∉",
        "∊",
        "∋",
        "∌",
        "∍",
        "⋲",
        "⋳",
        "⋴",
        "⋵",
        "⋶",
        "⋷",
        "⋸",
        "⋹",
        "⋺",
        "⋻",
        "⋼",
        "⋽",
        "⋾",
        "⋿"
    ],
    mho: ["℧"],
    micro: ["µ"],
    mid: ["∣"],
    mill: ["₥"],
    minus: ["−"],
    models: ["⊧"],
    mp: ["∓"],
    mu: ["μ"],
    multimap: ["⊸"],
    multiplication: ["×"],
    nLeftarrow: ["⇍"],
    nLeftrightarrow: ["⇎"],
    nRightarrow: ["⇏"],
    nVDash: ["⊯"],
    nVdash: ["⊮"],
    nabla: ["∇"],
    naira: ["₦"],
    napprox: ["≉"],
    natural: ["♮"],
    ncong: ["≇"],
    ne: ["≠"],
    nearrow: ["↗"],
    neg: ["¬"],
    neq: ["≠"],
    nequiv: ["≢"],
    newline: ["\u2028"],
    nexists: ["∄"],
    ngeq: ["≱"],
    ngeqq: ["≱"],
    ngeqslant: ["≱"],
    ngtr: ["≯"],
    ni: ["∋"],
    nin: ["∌"],
    nleftarrow: ["↚"],
    nleftrightarrow: ["↮"],
    nleq: ["≰"],
    nleqq: ["≰"],
    nleqslant: ["≰"],
    nless: ["≮"],
    nmid: ["∤"],
    nomisma: ["𐆎"],
    not: ["̸"],
    note: [
        "♩",
        "♪",
        "♫",
        "♬"
    ],
    notin: ["∉"],
    nparallel: ["∦"],
    nprec: ["⊀"],
    npreceq: ["⋠"],
    nrightarrow: ["↛"],
    nshortmid: ["∤"],
    nshortparallel: ["∦"],
    nsim: ["≁"],
    nsimeq: ["≄"],
    nsubset: ["⊄"],
    nsubseteq: ["⊈"],
    nsubseteqq: ["⊈"],
    nsucc: ["⊁"],
    nsucceq: ["⋡"],
    nsupset: ["⊅"],
    nsupseteq: ["⊉"],
    nsupseteqq: ["⊉"],
    ntriangleleft: ["⋪"],
    ntrianglelefteq: ["⋬"],
    ntriangleright: ["⋫"],
    ntrianglerighteq: ["⋭"],
    nu: ["ν"],
    numero: ["№"],
    nvDash: ["⊭"],
    nvdash: ["⊬"],
    nwarrow: ["↖"],
    o: ["ø", "∘"],
    "o*": ["⊛"],
    "o+": ["⊕"],
    "o-": ["⊝", "⟜"],
    "o--": ["⊖"],
    "o.": ["⊙"],
    "o/": ["⊘"],
    "o=": ["⊜"],
    octagonal: ["🛑"],
    odot: ["⊙"],
    oe: ["œ"],
    ohm: ["Ω"],
    oiiint: ["∰"],
    oiint: ["∯"],
    oint: ["∮"],
    omega: ["ω"],
    omicron: ["ο"],
    ominus: ["⊖"],
    oo: ["⊚"],
    oplus: ["⊕"],
    or: ["∨"],
    "or=": ["≚"],
    ordfeminine: ["ª"],
    ordmasculine: ["º"],
    oslash: ["⊘"],
    otimes: ["⊗"],
    ounce: ["℥"],
    overbrace: ["⏞"],
    overparen: ["⏜"],
    ox: ["⊗"],
    pa: ["▰", "▱"],
    pab: ["▰"],
    paragraph: ["¶"],
    parallel: ["∥"],
    partial: ["∂"],
    partnership: ["㉐"],
    paw: ["▱"],
    per: ["⅌"],
    permil: ["‰"],
    perp: ["⊥"],
    peseta: ["₧"],
    peso: ["₱"],
    phantom: ["⟡"],
    phi: ["ϕ"],
    pi: ["π"],
    pilcrow: ["¶"],
    pitchfork: ["⋔"],
    pm: ["±"],
    pound: ["£"],
    pounds: ["£"],
    pppprime: ["⁗"],
    ppprime: ["‴"],
    pprime: ["″"],
    prcue: ["≼"],
    prec: ["≺"],
    precapprox: ["≾"],
    preceq: ["≼"],
    precnapprox: ["⋨"],
    precnsim: ["⋨"],
    precsim: ["≾"],
    prime: ["′"],
    prod: ["∏"],
    prohibited: ["🛇"],
    propto: ["∝"],
    psi: ["ψ"],
    qdrt: ["∜"],
    qed: ["∎"],
    quad: [" "],
    r: [
        "→",
        "⇒",
        "⇛",
        "⭆",
        "⇉",
        "⇄",
        "↦",
        "⇨",
        "↠",
        "⇀",
        "⇁",
        "⇢",
        "⇻",
        "↝",
        "⇾",
        "⟶",
        "⟹",
        "↛",
        "⇏",
        "⇸",
        "⇶",
        "↴",
        "↣",
        "↪",
        "↬",
        "⇌",
        "⇝",
        "⇥",
        "⟼",
        "⟾",
        "⤇",
        "↷",
        "↻",
        "⟳",
        "⇰",
        "⇴",
        "⟴",
        "⟿",
        "➵",
        "➸",
        "➙",
        "➔",
        "➛",
        "➜",
        "➝",
        "➞",
        "➟",
        "➠",
        "➡",
        "➢",
        "➣",
        "➤",
        "➧",
        "➨",
        "➩",
        "➪",
        "➫",
        "➬",
        "➭",
        "➮",
        "➯",
        "➱",
        "➲",
        "➳",
        "➺",
        "➻",
        "➼",
        "➽",
        "➾",
        "⊸"
    ],
    "r-": ["→"],
    "r--": ["⟶"],
    "r-2": ["⇉"],
    "r-3": ["⇶"],
    "r->": ["↣"],
    "r-l-": ["⇄"],
    "r-n": ["↛"],
    "r-o": ["⊸"],
    "r-|": ["↦"],
    "r=": ["⇒"],
    "r==": ["⇛"],
    "r=n": ["⇏"],
    radioactive: ["☢"],
    rangle: ["⟩"],
    ratio: ["∶"],
    rbag: ["⟆"],
    rbrace: ["}"],
    rbrack: ["]"],
    rceil: ["⌉"],
    rdata: ["》"],
    rddots: ["⋰"],
    rdq: ["”"],
    re: [
        "▬",
        "▭",
        "▮",
        "▯"
    ],
    reb: ["▬", "▮"],
    rect: ["▭"],
    registered: ["®"],
    rew: ["▭", "▯"],
    rfloor: ["⌋"],
    rhd: ["▷"],
    rho: ["ρ"],
    rial: ["﷼"],
    rightarrow: ["→"],
    rightarrowtail: ["↣"],
    rightharpoondown: ["⇁"],
    rightharpoonup: ["⇀"],
    rightleftarrows: ["⇄"],
    rightleftharpoons: ["⇌"],
    rightrightarrows: ["⇉"],
    rightthreetimes: ["⋌"],
    risingdotseq: ["≓"],
    rq: ["’"],
    "rr-": ["↠"],
    rrbracket: ["〛"],
    rrect: ["▢"],
    rtimes: ["⋊"],
    ruble: ["₽"],
    rupee: ["₨"],
    "r~": [
        "↝",
        "⇝",
        "⟿"
    ],
    sampi: ["ϡ"],
    san: ["ϻ"],
    sbs: ["﹨"],
    sdiv: ["⁄"],
    searrow: ["↘"],
    section: ["§"],
    setminus: ["∖"],
    sharp: ["♯"],
    shei: ["ϣ"],
    shima: ["ϭ"],
    sho: ["ϸ"],
    shortmid: ["∣"],
    shortparallel: ["∥"],
    sigma: ["σ"],
    sim: ["∼"],
    simeq: ["≃"],
    smallamalg: ["∐"],
    smallsetminus: ["∖"],
    smallsmile: ["⌣"],
    smash: ["⬍"],
    smile: ["⌣"],
    som: ["⃀"],
    spadesuit: ["♠"],
    spesmilo: ["₷"],
    sphericalangle: ["∢"],
    sq: [
        "■",
        "□",
        "◼",
        "◻",
        "◾",
        "◽",
        "▣",
        "▢",
        "▤",
        "▥",
        "▦",
        "▧",
        "▨",
        "▩",
        "◧",
        "◨",
        "◩",
        "◪",
        "◫",
        "◰",
        "◱",
        "◲",
        "◳"
    ],
    "sq.": ["▣"],
    sqb: [
        "■",
        "◼",
        "◾"
    ],
    sqcap: ["⊓"],
    sqcup: ["⊔"],
    sqo: ["▢"],
    sqrt: ["√"],
    "sqrt[3]": ["∛"],
    "sqrt[4]": ["∜"],
    sqsubset: ["⊏"],
    sqsubseteq: ["⊑"],
    sqsupset: ["⊐"],
    sqsupseteq: ["⊒"],
    square: ["□"],
    squb: ["⊏"],
    "squb=": ["⊑"],
    "squb=n": ["⋢"],
    squigarrowright: ["⇝"],
    squp: ["⊐"],
    "squp=": ["⊒"],
    "squp=n": ["⋣"],
    sqw: [
        "□",
        "◻",
        "◽"
    ],
    ss: ["ß"],
    st: [
        "⋆",
        "✦",
        "✧",
        "✶",
        "✴",
        "✹",
        "★",
        "☆",
        "✪",
        "✫",
        "✯",
        "✰",
        "✵",
        "✷",
        "✸"
    ],
    st12: ["✹"],
    st4: ["✦", "✧"],
    st6: ["✶"],
    st8: ["✴"],
    star: ["⋆"],
    stigma: ["ϛ"],
    straightphi: ["φ"],
    sub: ["⊂"],
    "sub=": ["⊆"],
    "sub=n": ["⊈"],
    subn: ["⊄"],
    subset: ["⊂"],
    subseteq: ["⊆"],
    subseteqq: ["⊆"],
    subsetneq: ["⊊"],
    subsetneqq: ["⊊"],
    "sub~": ["⫇"],
    "sub~~": ["⫉"],
    succ: ["≻"],
    succapprox: ["≿"],
    succcurlyeq: ["≽"],
    succeq: ["≽"],
    succnapprox: ["⋩"],
    succnsim: ["⋩"],
    succsim: ["≿"],
    sum: ["∑"],
    sup: ["⊃"],
    "sup=": ["⊇"],
    "sup=n": ["⊉"],
    supn: ["⊅"],
    supset: ["⊃"],
    supseteq: ["⊇"],
    supseteqq: ["⊇"],
    supsetneq: ["⊋"],
    supsetneqq: ["⊋"],
    "sup~": ["⫈"],
    "sup~~": ["⫊"],
    surd: ["√"],
    surd3: ["∛"],
    surd4: ["∜"],
    swarrow: ["↙"],
    t: [
        "◂",
        "◃",
        "◄",
        "◅",
        "▸",
        "▹",
        "►",
        "▻",
        "▴",
        "▵",
        "▾",
        "▿",
        "◢",
        "◿",
        "◣",
        "◺",
        "◤",
        "◸",
        "◥",
        "◹"
    ],
    "t=": ["≜"],
    tack: [
        "⟘",
        "⟙",
        "⟛",
        "⟝",
        "⟞",
        "⫫",
        "⫪"
    ],
    tau: ["τ"],
    tb: [
        "◂",
        "▸",
        "▴",
        "▾",
        "◄",
        "►",
        "◢",
        "◣",
        "◤",
        "◥"
    ],
    telephone: ["℡"],
    tenge: ["₸"],
    textbaht: ["฿"],
    textbigcircle: ["⃝"],
    textcircledP: ["℗"],
    textcolonmonetary: ["₡"],
    textdied: ["✝"],
    textdiscount: ["⁒"],
    textestimated: ["℮"],
    textfractionsolidus: ["⁄"],
    textinterrobang: ["‽"],
    textlira: ["₤"],
    textlquill: ["⁅"],
    textmu: ["µ"],
    textmusicalnote: ["♪"],
    textnaira: ["₦"],
    textnumero: ["№"],
    textopenbullet: ["◦"],
    textpertenthousand: ["‱"],
    textpeso: ["₱"],
    textrecipe: ["℞"],
    textreferencemark: ["※"],
    textrquill: ["⁆"],
    textwon: ["₩"],
    th: ["þ"],
    therefore: ["∴"],
    theta: ["θ"],
    thickapprox: ["≈"],
    thicksim: ["∼"],
    tie: ["⁀"],
    times: ["×"],
    to: ["→"],
    top: ["⊤"],
    triangle: ["▵"],
    triangledown: ["▿"],
    triangleleft: ["◃"],
    trianglelefteq: ["⊴"],
    triangleq: ["≜"],
    triangleright: ["▹"],
    trianglerighteq: ["⊵"],
    tugrik: ["₮"],
    tw: [
        "◃",
        "▹",
        "▵",
        "▿",
        "◅",
        "▻",
        "◿",
        "◺",
        "◸",
        "◹"
    ],
    twoheadleftarrow: ["↞"],
    twoheadrightarrow: ["↠"],
    u: [
        "̆",
        "↑",
        "⇑",
        "⤊",
        "⟰",
        "⇈",
        "⇅",
        "↥",
        "⇧",
        "↟",
        "↿",
        "↾",
        "⇡",
        "⇞",
        "↰",
        "↱",
        "➦",
        "⇪",
        "⇫",
        "⇬",
        "⇭",
        "⇮",
        "⇯"
    ],
    "u+": ["⊎"],
    "u-": ["↑"],
    "u-2": ["⇈"],
    "u-d-": ["⇅"],
    "u-|": ["↥"],
    "u.": ["⊍"],
    "u=": ["⇑"],
    "u==": ["⟰"],
    uA: ["Ă"],
    uE: ["Ĕ"],
    uG: ["Ğ"],
    uI: ["Ĭ"],
    uO: ["Ŏ"],
    uU: ["Ŭ"],
    ua: ["ă"],
    ud: [
        "↕",
        "⇕",
        "↨",
        "⇳"
    ],
    "ud-": ["↕"],
    "ud-|": ["↨"],
    "ud=": ["⇕"],
    ue: ["ĕ"],
    ug: ["ğ"],
    ui: ["ĭ"],
    uin: ["⟒"],
    ul: [
        "↖",
        "⇖",
        "⇱",
        "↸"
    ],
    "ul-": ["↖"],
    "ul=": ["⇖"],
    ulcorner: ["⌜"],
    un: ["∪"],
    uncertainty: ["⯑"],
    underbar: ["▁"],
    underbrace: ["⏟"],
    underparen: ["⏝"],
    undertie: ["‿"],
    union: [
        "∪",
        "⋃",
        "∨",
        "⋁",
        "⋎",
        "⨈",
        "⊔",
        "⨆",
        "⋓",
        "∐",
        "⨿",
        "⊽",
        "⊻",
        "⊍",
        "⨃",
        "⊎",
        "⨄",
        "⊌",
        "∑",
        "⅀"
    ],
    uo: ["ŏ"],
    uparrow: ["↑"],
    updownarrow: ["↕"],
    upleftharpoon: ["↿"],
    uplus: ["⊎"],
    uprightharpoon: ["↾"],
    upsilon: ["υ"],
    upuparrows: ["⇈"],
    ur: [
        "↗",
        "⇗",
        "➶",
        "➹",
        "➚"
    ],
    "ur-": ["↗"],
    "ur=": ["⇗"],
    urcorner: ["⌝"],
    uu: ["ŭ"],
    "uu-": ["↟"],
    "u{A}": ["Ă"],
    "u{E}": ["Ĕ"],
    "u{G}": ["Ğ"],
    "u{I}": ["Ĭ"],
    "u{O}": ["Ŏ"],
    "u{U}": ["Ŭ"],
    "u{\\i}": ["ĭ"],
    "u{a}": ["ă"],
    "u{e}": ["ĕ"],
    "u{g}": ["ğ"],
    "u{i}": ["ĭ"],
    "u{o}": ["ŏ"],
    "u{u}": ["ŭ"],
    "u{}": ["˘"],
    v: ["̌"],
    vA: ["Ǎ"],
    vC: ["Č"],
    vD: ["Ď"],
    vDash: ["⊨"],
    vE: ["Ě"],
    vG: ["Ǧ"],
    vH: ["Ȟ"],
    vI: ["Ǐ"],
    vK: ["Ǩ"],
    vL: ["Ľ"],
    vN: ["Ň"],
    vO: ["Ǒ"],
    vR: ["Ř"],
    vS: ["Š"],
    vT: ["Ť"],
    vU: ["Ǔ"],
    vZ: ["Ž"],
    va: ["ǎ"],
    varbeta: ["ϐ"],
    varepsilon: ["ε"],
    varkai: ["ϗ"],
    varkappa: ["ϰ"],
    varphi: ["φ"],
    varpi: ["ϖ"],
    varprime: ["′"],
    varpropto: ["∝"],
    varrho: ["ϱ"],
    varsigma: ["ς"],
    vartheta: ["ϑ"],
    vartriangleleft: ["⊲"],
    vartriangleright: ["⊳"],
    vbar: ["│"],
    vc: ["č"],
    vd: ["ď"],
    vdash: ["⊢"],
    vdots: ["⋮"],
    ve: ["ě"],
    vee: ["∨"],
    veebar: ["⊻"],
    vert: ["|"],
    vg: ["ǧ"],
    vh: ["ȟ"],
    vi: ["ǐ"],
    vj: ["ǰ"],
    vk: ["ǩ"],
    vl: ["ľ"],
    vn: ["ň"],
    vo: ["ǒ"],
    vphantom: ["⇳"],
    vr: ["ř"],
    vs: ["š"],
    vt: ["ť"],
    vu: ["ǔ"],
    vz: ["ž"],
    "v{A}": ["Ǎ"],
    "v{C}": ["Č"],
    "v{D}": ["Ď"],
    "v{E}": ["Ě"],
    "v{G}": ["Ǧ"],
    "v{H}": ["Ȟ"],
    "v{I}": ["Ǐ"],
    "v{K}": ["Ǩ"],
    "v{L}": ["Ľ"],
    "v{N}": ["Ň"],
    "v{O}": ["Ǒ"],
    "v{R}": ["Ř"],
    "v{S}": ["Š"],
    "v{T}": ["Ť"],
    "v{U}": ["Ǔ"],
    "v{Z}": ["Ž"],
    "v{\\i}": ["ǐ"],
    "v{\\j}": ["ǰ"],
    "v{a}": ["ǎ"],
    "v{c}": ["č"],
    "v{d}": ["ď"],
    "v{e}": ["ě"],
    "v{g}": ["ǧ"],
    "v{h}": ["ȟ"],
    "v{i}": ["ǐ"],
    "v{j}": ["ǰ"],
    "v{k}": ["ǩ"],
    "v{l}": ["ľ"],
    "v{n}": ["ň"],
    "v{o}": ["ǒ"],
    "v{r}": ["ř"],
    "v{s}": ["š"],
    "v{t}": ["ť"],
    "v{u}": ["ǔ"],
    "v{z}": ["ž"],
    "v{}": ["ˇ"],
    warning: ["⚠"],
    wedge: ["∧"],
    won: ["₩"],
    wp: ["℘"],
    wr: ["≀"],
    x: ["×"],
    xi: ["ξ"],
    yen: ["¥"],
    "z:": ["⦂"],
    "z;": ["⨟", "⨾"],
    zeta: ["ζ"],
    "{{": ["⦃"],
    "|": ["∣"],
    "|)": ["⦈"],
    "|-": ["⊢"],
    "|--": ["⟝"],
    "|-n": ["⊬"],
    "|=": ["⊨"],
    "|=n": ["⊭"],
    "|>": ["⦊"],
    "|n": ["∤"],
    "||": ["∥"],
    "||-": ["⊩"],
    "||-n": ["⊮"],
    "||=": ["⊫"],
    "||=n": ["⊯"],
    "||n": ["∦"],
    "|||-": ["⊪"],
    "}}": ["⦄"],
    "~": [
        "̃",
        "∼",
        "～"
    ],
    "~-": ["≃"],
    "~-n": ["≄"],
    "~=": ["≅"],
    "~=n": ["≇"],
    "~A": ["Ã"],
    "~E": ["Ẽ"],
    "~I": ["Ĩ"],
    "~N": ["Ñ"],
    "~O": ["Õ"],
    "~U": ["Ũ"],
    "~V": ["Ṽ"],
    "~Y": ["Ỹ"],
    "~a": ["ã"],
    "~e": ["ẽ"],
    "~i": ["ĩ"],
    "~n": ["ñ", "≁"],
    "~o": ["õ"],
    "~u": ["ũ"],
    "~v": ["ṽ"],
    "~y": ["ỹ"],
    "~{A}": ["Ã"],
    "~{E}": ["Ẽ"],
    "~{I}": ["Ĩ"],
    "~{N}": ["Ñ"],
    "~{O}": ["Õ"],
    "~{U}": ["Ũ"],
    "~{V}": ["Ṽ"],
    "~{Y}": ["Ỹ"],
    "~{\\i}": ["ĩ"],
    "~{a}": ["ã"],
    "~{e}": ["ẽ"],
    "~{i}": ["ĩ"],
    "~{n}": ["ñ"],
    "~{o}": ["õ"],
    "~{u}": ["ũ"],
    "~{v}": ["ṽ"],
    "~{y}": ["ỹ"],
    "~{}": ["˜"],
    "~~": ["≈"],
    "~~-": ["≊"],
    "~~n": ["≉"],
    "~~~": ["≋"]
};
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/match.ts
function positionsToIntervals(xs) {
    if (!xs.length) return [];
    let start = xs[0], prev = xs[0];
    const ret = [];
    for (let idx = 1; idx < xs.length; idx++) {
        const cur = xs[idx];
        if (cur == prev + 1) {
            prev++;
            continue;
        }
        ret.push([start, prev + 1]);
        start = prev = cur;
    }
    ret.push([start, prev + 1]);
    return ret;
}
function fzfMatchEngine(dict) {
    const coll = new Fzf(Object.keys(dict), {
        casing: "case-sensitive",
        tiebreakers: [byStartAsc]
    });
    return (s) => {
        const exactMatches = dict[s] ?? [];
        const candidates = [];
        const t0 = Date.now();
        for (const { item, score, positions } of coll.find(s)) {
            if (item === s) continue;
            candidates.push({
                item,
                value: dict[item],
                score,
                matches: positionsToIntervals(Array.from(positions).sort((a, b) => a - b))
            });
        }
        const elp = Date.now() - t0;
        if (elp > 50) console.warn("Filtering on candidates takes too long", elp);
        return {
            exactMatches,
            candidates
        };
    };
}
const fzfMatcher = () => fzfMatchEngine(dict_default);
const siBufferAppend = StateEffect.define();
const siBufferBackspace = StateEffect.define();
const siBufferClear = StateEffect.define();
const siMoveSelection = StateEffect.define();
const USER_EVENT_TYPE_COMPOSE = "input.type.symbol-input";
const USER_EVENT_TYPE_COMPOSE_START = "input.type.symbol-input.start";
function moveSelection$1(state, delta, horizontal) {
    const { matches, selection } = state;
    if (selection.onExactMatch) {
        const target = selection.selectedIndex + delta * (horizontal ? 1 : 8);
        if (target < 0) return null;
        else if (target >= matches.exactMatches.length) if (matches.candidates.length) return {
            onExactMatch: false,
            selectedIndex: 0
        };
        else return null;
        return {
            onExactMatch: true,
            selectedIndex: target
        };
    } else {
        const target = selection.selectedIndex + delta;
        if (target < 0) if (matches.exactMatches.length) return {
            onExactMatch: true,
            selectedIndex: horizontal ? matches.exactMatches.length - 1 : 8 * Math.floor(matches.exactMatches.length / 8)
        };
        else return null;
        else if (target >= matches.candidates.length) return null;
        return {
            onExactMatch: false,
            selectedIndex: target
        };
    }
}
function hasResult(r) {
    return !!r.exactMatches.length || !!r.candidates.length;
}
const fzfMatch = fzfMatcher();
var SymbolInputState = class SymbolInputState {
    text;
    tooltip;
    matches;
    selection;
    constructor(text, tooltip, matches = SymbolInputState.emptyResult, selection = SymbolInputState.initialSelection) {
        this.text = text;
        this.tooltip = tooltip;
        this.matches = matches;
        this.selection = selection;
    }
    update(tr) {
        if (tr.docChanged || !tr.newSelection.eq(tr.startState.selection)) {
            const evt = tr.annotation(Transaction.userEvent);
            if (evt !== "input.type" && evt !== "input.type.compose.start" && evt !== "input.type.symbol-input" && evt !== "input.type.symbol-input.start") return SymbolInputState.initial;
        }
        let state = this;
        for (const e of tr.effects) if (e.is(siBufferAppend)) if (state.text == null) {
            if (e.value.insert !== "\\") throw new Error("The symbol input sequence should begin with \"\\\"");
            state = new SymbolInputState("", null);
        } else {
            const newText = state.text + e.value.insert;
            const mat = fzfMatch(newText);
            state = new SymbolInputState(newText, hasResult(mat) ? state.tooltip ?? this.createTooltip(tr.state) : null, mat, {
                onExactMatch: !!mat.exactMatches.length,
                selectedIndex: 0
            });
        }
        else if (e.is(siBufferBackspace)) {
            const newText = state.text == null || state.text === "" ? null : state.text.slice(0, -1);
            if (newText) {
                const mat = fzfMatch(newText);
                state = new SymbolInputState(newText, hasResult(mat) ? state.tooltip ?? this.createTooltip(tr.state) : null, mat, {
                    onExactMatch: state.selection.onExactMatch && !!mat.exactMatches.length || !mat.candidates.length,
                    selectedIndex: 0
                });
            } else state = newText == null ? SymbolInputState.initial : new SymbolInputState(newText, null);
        } else if (e.is(siBufferClear)) state = SymbolInputState.initial;
        else if (e.is(siMoveSelection)) {
            let newSel = moveSelection$1(state, {
                u: -1,
                d: 1,
                l: -1,
                r: 1
            }[e.value], e.value === "l" || e.value === "r");
            if (newSel) state = new SymbolInputState(state.text, state.tooltip, state.matches, newSel);
        }
        return state;
    }
    createTooltip(state) {
        return {
            pos: state.selection.main.anchor - 1,
            create: createCandidateDialog,
            clip: false
        };
    }
    get active() {
        return this.text !== null;
    }
    get selectedValue() {
        if (this.selection.onExactMatch) return this.matches.exactMatches[this.selection.selectedIndex];
        else return this.matches.candidates[this.selection.selectedIndex]?.value[0];
    }
    static emptyResult = {
        candidates: [],
        exactMatches: []
    };
    static initialSelection = {
        onExactMatch: false,
        selectedIndex: 0
    };
    static initial = new SymbolInputState(null, null, SymbolInputState.emptyResult, SymbolInputState.initialSelection);
};
var InputBufferInlineWidget = class extends WidgetType {
    text;
    noMatch;
    constructor(text, noMatch) {
        super();
        this.text = text;
        this.noMatch = noMatch;
    }
    toDOM(view) {
        const dom = createElement(view, "span");
        dom.classList = "input-buffer-inline";
        this.updateDOM(dom, view, this);
        return dom;
    }
    updateDOM(dom, _view, _from) {
        dom.textContent = "\\" + this.text;
        dom.classList.toggle("no-match", this.noMatch);
        return true;
    }
};
const symbolInputState = StateField.define({
    create() {
        return SymbolInputState.initial;
    },
    update(value, tr) {
        return value.update(tr);
    },
    provide(f) {
        return [EditorView.decorations.compute([f], (state) => {
            const istate = state.field(f);
            if (!istate.active) return Decoration.none;
            const text = istate.text;
            const widgets = state.selection.ranges.map(({ to }) => Decoration.replace({ widget: new InputBufferInlineWidget(text, text != "" && !hasResult(istate.matches)) }).range(to - 1, to));
            return Decoration.set(widgets, true);
        }), showTooltip.from(f, (istate) => istate.tooltip ?? null)];
    }
});
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/plugin.ts
const symbolInputPlugin = ViewPlugin.fromClass(class SymbolInputPluginValue {
    update(upd) {
        const istate = upd.state.field(symbolInputState);
        const compDialog = upd.view.dom.querySelector(".cm-tooltip-autocomplete");
        if (compDialog) {
            const active = istate.active;
            compDialog.classList.toggle("cm-tooltip-autocomplete-disabled", active);
            compDialog.classList.toggle("overridden-by-ime", active);
        }
    }
});
function scrollInputBufferIntoView(view) {
    if (!view.plugin(symbolInputPlugin)) return;
    const sel = view.state.selection.main;
    if (!sel) return;
    view.dispatch({ effects: EditorView.scrollIntoView(sel) });
}
const inputHandler = EditorView.inputHandler.of((view, _from, _to, text) => {
    if (view.composing) return false;
    const isActive = view.state.field(symbolInputState).active;
    if (!isActive && text === "\\") view.dispatch({
        ...view.state.replaceSelection("\\"),
        effects: siBufferAppend.of({ insert: "\\" }),
        annotations: [Transaction.userEvent.of(USER_EVENT_TYPE_COMPOSE_START), isolateHistory.of("full")]
    });
    else if (isActive) view.dispatch({ effects: siBufferAppend.of({ insert: text }) });
    else return false;
    scrollInputBufferIntoView(view);
    return true;
});
function moveSelection(dir) {
    return (view) => {
        if (!view.state.field(symbolInputState).active) return false;
        view.dispatch({ effects: siMoveSelection.of(dir) });
        return true;
    };
}
const withInputState = (cb) => {
    return (view) => {
        const istate = view.state.field(symbolInputState);
        if (!istate.active) return false;
        return cb(view, istate);
    };
};
const cancelSymbolInput = withInputState((view) => {
    undo(view);
    return true;
});
const backspaceSymbolInput = withInputState((view) => {
    view.dispatch({ effects: siBufferBackspace.of(null) });
    if (!view.state.field(symbolInputState).active) undo(view);
    else scrollInputBufferIntoView(view);
    return true;
});
const acceptSymbolInput = withInputState((view, istate) => {
    if (istate.text === "") {
        undo(view);
        view.dispatch({
            ...view.state.replaceSelection("\\"),
            annotations: Transaction.userEvent.of("input.type")
        });
        return true;
    }
    const insert = istate.selectedValue;
    if (insert) {
        undo(view);
        view.dispatch({
            ...view.state.replaceSelection(insert),
            annotations: Transaction.userEvent.of(USER_EVENT_TYPE_COMPOSE)
        });
        return true;
    }
    return false;
});
const acceptSymbolInputViaSpace = withInputState((view, istate) => {
    if (istate.text == null || istate.text.match(/^(?:\+ *| +|$)/)) return false;
    return acceptSymbolInput(view);
});
const symbolInputKeymap = keymap.of([
    {
        key: "Backspace",
        run: backspaceSymbolInput
    },
    {
        key: "Escape",
        run: cancelSymbolInput
    },
    {
        key: "Enter",
        run: acceptSymbolInput
    },
    {
        key: "Space",
        run: acceptSymbolInputViaSpace
    },
    {
        key: "ArrowUp",
        run: moveSelection("u")
    },
    {
        key: "ArrowDown",
        run: moveSelection("d")
    },
    {
        key: "ArrowLeft",
        run: moveSelection("l")
    },
    {
        key: "ArrowRight",
        run: moveSelection("r")
    }
]);
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/theme.ts
const symbolInputTheme = EditorView.baseTheme({
    ".input-buffer-inline": {
        textDecoration: "underline",
        background: "#999",
        color: "#333"
    },
    ".input-buffer-inline.no-match": {
        background: "#9003",
        color: "#fcc"
    },
    ".symbol-input-candidates": {
        minWidth: "10em",
        maxHeight: "200px",
        maxWidth: "400px",
        overflow: "auto"
    },
    ".symbol-input-candidates .symbol": { fontSize: "1.25rem" },
    ".symbol-input-candidates .unic": { fontSize: ".5rem" },
    ".symbol-input-candidates .label": { fontFamily: "var(--font-monospace, monospace)" },
    ".symbol-input-candidates li .has-more": {
        fontSize: ".8rem",
        fontStyle: "italic"
    },
    ".symbol-input-candidates .label mark": { background: "#DFB431" },
    ".symbol-input-candidates .desc": {
        color: "#888",
        fontSize: ".75em",
        fontFamily: "var(--font-monospace, monospace)",
        whiteSpace: "pre"
    },
    ".symbol-input-candidates li > .symbol.alt": { color: "#888" },
    ".symbol-input-candidates li > .symbol": {
        minWidth: "1.25em",
        display: "inline-block",
        textAlign: "center"
    },
    ".symbol-input-candidates li > .symbol.mono": { fontFamily: "var(--font-monospace, monospace)" },
    ".symbol-input-candidates ul": {
        listStyleType: "none",
        padding: "0",
        margin: "0"
    },
    ".symbol-input-candidates ul.exact": {
        display: "grid",
        gridTemplateColumns: `repeat(8, 1fr)`,
        borderBottom: "1px solid black"
    },
    ".symbol-input-candidates ul.exact > li": { textAlign: "center" },
    ".symbol-input-candidates ul.matches > li": {
        display: "flex",
        gap: "4px",
        alignItems: "baseline",
        marginTop: "2px"
    },
    ".symbol-input-candidates ul.matches > li .symbol.mono": {
        minWidth: "1.75em",
        background: "#8886"
    },
    ".symbol-input-candidates .selected": {
        color: "#fff",
        background: "#000"
    },
    ".cm-tooltip.symbol-input-candidates": {
        background: "#ddd",
        whiteSpace: "nowrap",
        color: "#111",
        padding: "4px"
    },
    ".cm-tooltip-autocomplete-disabled.overridden-by-ime": {
        color: "#777",
        background: "#ccc"
    }
});
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/special-chars.ts
const specialCharDescs = {
    160: "No-Break Space",
    173: "Soft Hyphen",
    8193: "Em Quad",
    8196: "Three-Per-Em Space",
    8197: "Four-Per-Em Space",
    8204: "Zero Width Non-Joiner",
    8239: "Narrow No-Break Space"
};
const highlightMoreSpecialChars = highlightSpecialChars({
    addSpecialChars: /[\u00a0\u2001\u2004\u2005\u200c\u202f]/,
    render(code, _desc, ph) {
        const ent = specialCharDescs[code];
        if (!ent) return null;
        const span = document.createElement("span");
        span.textContent = ph;
        const desc = `${ent} (U+${toUnicodeRepr(code)})`;
        span.title = desc;
        span.setAttribute("aria-label", desc);
        span.className = "cm-specialChar";
        return span;
    }
});
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/patch-basic-setup.ts
function patchBasicSetup(_basicSetup) {
    if (!Array.isArray(_basicSetup)) throw new Error("basicSetup should be an array");
    const basicSetup = _basicSetup;
    let didRemoveAutocompleteFromBasicSetup = false;
    let didRemoveCompletionKeyBindings = false;
    const ret = basicSetup.map((ext) => {
        if (Array.isArray(ext)) {
            const config = ext[2]?.facet?.default;
            if (config && "activateOnTyping" in config) {
                didRemoveAutocompleteFromBasicSetup = true;
                return [];
            }
        }
        if ("facet" in ext && "value" in ext && ext.facet === keymap) {
            const kbs = ext.value;
            const kbsAfter = kbs.filter((x) => !x.run?.name.match(/Completion/));
            if (kbsAfter.length < kbs.length) didRemoveCompletionKeyBindings = true;
            return keymap.of(kbsAfter);
        }
        return ext;
    });
    if (!didRemoveAutocompleteFromBasicSetup || !didRemoveCompletionKeyBindings) throw new Error("Failed to patch basicSetup to remove its dependency on autoComplete package; check minification settings!");
    return ret;
}
//#endregion
//#region packages/app/src/lib/codemirror/symbol-input/index.ts
function symbolInput(options = {}) {
    return [
        Prec.highest(symbolInputState),
        symbolInputPlugin,
        Prec.highest(inputHandler),
        Prec.highest(symbolInputKeymap),
        symbolInputTheme,
        highlightMoreSpecialChars
    ];
}
//#endregion
export { patchBasicSetup, symbolInput };
