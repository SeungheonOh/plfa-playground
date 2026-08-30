import { autoColorScheme } from '$lib/codemirror/theme'
import { offsetTracking } from '$lib/codemirror/offsets'

import { agdaHighlight } from './highlight'
import { agdaDarkSchemeFromEmacs, agdaLightSchemeFromEmacs } from './color-scheme'
import { agdaGoals } from './goals'

/**
 * @typedef _AgdaSupportOptions
 * @prop {void} _
 */

/** @typedef {Partial<_AgdaSupportOptions>} AgdaSupportOptions */

/**
 * @param {AgdaSupportOptions} [options]
 * @returns {import('@codemirror/state').Extension}
 */
export function agdaSupport(options) {
  void options
  return [
    offsetTracking(),
    autoColorScheme({
      dark: agdaDarkSchemeFromEmacs,
      light: agdaLightSchemeFromEmacs,
      defaultDark: false,
    }),
    agdaHighlight(),
    agdaGoals(),
  ]
}
