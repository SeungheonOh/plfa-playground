import { Compartment, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'

// TODO: split baseTheme with (the real) theme
export const myBaseTheme = EditorView.baseTheme({
  '&': {
    border: '0 none',
    fontSize: '14px',
    '&.cm-focused': {
      outline: '0 none',
      // outlineOffset: '1px',
    },
  },
  '&.cm-editor': {
    borderRadius: '0',
    height: '100%',
    width: '100%',
  },
  '.cm-content, .cm-lineNumbers, .cm-gutterElement': {
    fontFamily: 'JuliaMono, monospace',
    // seems that more people love half-width arrows...
    // fontFeatureSettings: '"calt" off, "NWID" on',
  },
  '&dark .cm-activeLine': {
    backgroundColor: '#66666620',
  },
  '&dark .cm-activeLineGutter': {
    background: '#66666620',
  },
  '.cm-selectionMatch.cm-selectionMatch': {
    // FIXME
    backgroundColor: 'transparent',
    outline: '1px solid #AAAAAAC0',
    borderRadius: '2px',
  },
  '&dark .cm-selectionMatch.cm-selectionMatch': {
    outlineColor: '#666666C0',
  },

  '&dark .cm-cursor': {
    borderLeftColor: '#bbb',
    borderLeftWidth: '2px',
  },
  '&dark .cm-foldPlaceholder.cm-foldPlaceholder': {
    // FIXME
    backgroundColor: '#333',
    borderColor: '#444',
  },

  '.cm-tooltip-section': {
    padding: '4px',
    marginTop: '4px',
    marginBottom: '0',
  },
  '&dark .cm-tooltip-section': {
    borderTop: '1px solid #777',
  },

  '&dark .cm-tooltip.cm-tooltip.cm-tooltip-hover': {
    borderColor: '#111',
  },

  '.cm-tooltip-section:first-child': {
    marginTop: '0',
    borderTop: 'none',
  },

  '.cm-tooltip.cm-tooltip-above': {
    marginBottom: '7px',
  },

  // helpers
  '.cm-agda-marks.hovered-keyword': {
    borderRadius: '2px',
    outline: '1px solid #000000c0',
  },
  '&dark .cm-agda-marks.hovered-keyword': {
    outlineColor: '#ffffffc0',
  },
})

const SELECTOR_PREFERS_DARK_COLOR_SCHEME = '(prefers-color-scheme: dark)'

export function prefersDarkTheme(win: { matchMedia: (q: string) => { matches: boolean } }) {
  return win.matchMedia(SELECTOR_PREFERS_DARK_COLOR_SCHEME).matches
}

export function autoColorScheme(options: {
  dark?: Extension, light?: Extension, defaultDark?: boolean} = {}): Extension {

  const {
    dark: darkExt = [],
    light: lightExt = [],
    defaultDark = false,
  } = options

  const darkThemeCompartment = new Compartment()

  function darkThemeExt(dark: boolean): Extension {
    return dark ? darkExt : lightExt
  }

  const plugin = ViewPlugin.define((view) => {
    function colorSchemeChangeHandler(evt: MediaQueryListEvent) {
      dispatchDarkTheme(evt.matches)
    }

    function dispatchDarkTheme(dark: boolean) {
      console.log('dispatch dark theme', dark)
      view.dispatch({
        effects: darkThemeCompartment.reconfigure(darkThemeExt(dark)),
      })
    }

    const win = view.dom.ownerDocument.defaultView
    const supportsMatchMedia = typeof win?.matchMedia === 'function'

    if (supportsMatchMedia) {
      const query = win.matchMedia(SELECTOR_PREFERS_DARK_COLOR_SCHEME)
      query.addEventListener('change', colorSchemeChangeHandler)
      if (query.matches !== defaultDark) {
        dispatchDarkTheme(query.matches)
      }
      return {
        destroy() {
          query.removeEventListener('change', colorSchemeChangeHandler)
        }
      }
    }

    // matchMedia is unsupported?
    return {}
  })

  return [
    plugin,
    darkThemeCompartment.of(darkThemeExt(defaultDark)),
  ]
}

export function myCodeMirrorTheme(): Extension {
  return [
    myBaseTheme,
    EditorView.theme({
      '.cm-tooltip': {
        overflow: 'auto',
        zIndex: 500,  // must be > 300 (.cm-panels)
      },
      '.cm-tooltip.cm-tooltip-hover': {
        borderRadius: '2px',
        border: '1px solid #4c4b51',
      },
    }),
  ]
}
