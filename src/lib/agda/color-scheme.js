import { EditorView } from '@codemirror/view'

export const agdaLightSchemeFromEmacs = EditorView.theme({
  // not a part of Agda's theme, but Emacs' built-in palette
  '.agda-hole': { background: '#b4eeb4C0' },  // darkseagreen2
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // extracted from Agda's Emacs theme
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#777', fontStyle: 'italic' },
  '.agda-keyword':                  { color: '#cd6600' },  // DarkOrange3
  '.agda-string':                   { color: '#b22222' },  // firebrick
  '.agda-number':                   { color: '#a020f0' },  // purple
  //   hole; see above
  '.agda-symbol':                   { color: '#404040' },  // gray25
  '.agda-primitivetype':            { color: '#0000cd' },  // medium blue
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#008b00' },  // green4
    '.agda-coinductiveconstructor': { color: '#8b7500' },  // gold4
    '.agda-datatype':               { color: '#0000cd' },  // medium blue
    '.agda-field':                  { color: '#ee1289' },  // DeepPink2
    '.agda-function':               { color: '#0000cd' },  // medium blue
    '.agda-module':                 { color: '#a020f0' },  // purple
    '.agda-postulate':              { color: '#0000cd' },  // medium blue
    '.agda-primitive':              { color: '#0000cd' },  // medium blue
    '.agda-record':                 { color: '#0000cd' },  // medium blue
  //     argument
    '.agda-macro':                  { color: '#458b74' },  // aquamarine4
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: 'red' },
  '.agda-errorwarning':             { backgroundColor: '#f0808080' },  // light coral
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#ffff0080' },  // yellow
  '.agda-unsolvedconstraint':       { backgroundColor: '#ffff0080' },  // yellow
  '.agda-terminationproblem':       { backgroundColor: '#ffa07a80' },  // light salmon
  '.agda-positivityproblem':        { backgroundColor: '#cd853f80' },  // peru
  '.agda-deadcode':                 { backgroundColor: '#a9a9a980' },  // dark gray
  '.agda-shadowingintelescope':     { backgroundColor: '#a9a9a980' },  // dark gray
  '.agda-coverageproblem':          { backgroundColor: '#f5deb380' },  // wheat
  // incompletepattern
  '.agda-typechecks':               { color: 'black', backgroundColor: '#add8e680' },  // light blue
  '.agda-missingdefinition':        { backgroundColor: '#ffa50080' },  // orange
  '.agda-instanceproblem':          { backgroundColor: '#f5deb380' },  // wheat
  '.agda-cosmeticproblem':          { backgroundColor: '#f5f5f580' },  // white smoke
  '.agda-catchallclause':           { backgroundColor: '#f5f5f580' },  // white smoke
  '.agda-confluenceproblem':        { backgroundColor: '#ffc0cb80' },  // pink
})

export const agdaDarkSchemeFromEmacs = EditorView.theme({
  // not a part of Agda's theme, but Emacs' built-in palette
  '.agda-hole': { background: '#556B2FC0' },  // DarkOliveGreen
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // extracted from Agda's Emacs theme
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#999', fontStyle: 'italic' },
  '.agda-keyword':                  { color: '#FF9932' },
  '.agda-string':                   { color: '#DD4D4D' },
  '.agda-number':                   { color: '#9010E0' },
  //   hole; see above
  '.agda-symbol':                   { color: '#BFBFBF' },  // gray75
  '.agda-primitivetype':            { color: '#8080FF' },
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#29CC29' },
    '.agda-coinductiveconstructor': { color: '#FFEA75' },
    '.agda-datatype':               { color: '#8080FF' },
    '.agda-field':                  { color: '#F570B7' },
    '.agda-function':               { color: '#8080FF' },
    '.agda-module':                 { color: '#CD80FF' },
    '.agda-postulate':              { color: '#8080FF' },
    '.agda-primitive':              { color: '#8080FF' },
    '.agda-record':                 { color: '#8080FF' },
  //     argument
    '.agda-macro':                  { color: '#73BAA2' },
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: '#FF0000' },
  '.agda-errorwarning':             { backgroundColor: '#80240080' },
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#806B0080' },
  '.agda-unsolvedconstraint':       { backgroundColor: '#806B0080' },
  '.agda-terminationproblem':       { backgroundColor: '#80240080' },
  '.agda-positivityproblem':        { backgroundColor: '#803F0080' },
  '.agda-deadcode':                 { backgroundColor: '#80808080' },
  '.agda-shadowingintelescope':     { backgroundColor: '#80808080' },
  '.agda-coverageproblem':          { backgroundColor: '#80530080' },
  // incompletepattern
  '.agda-typechecks':               { color: 'white', backgroundColor: '#00608080' },
  '.agda-missingdefinition':        { backgroundColor: '#80404080' },
  '.agda-instanceproblem':          { backgroundColor: '#80530080' },
  '.agda-cosmeticproblem':          { backgroundColor: '#40404080' },
  '.agda-catchallclause':           { backgroundColor: '#40404080' },
  '.agda-confluenceproblem':        { backgroundColor: '#80008080' },
}, { dark: true })
