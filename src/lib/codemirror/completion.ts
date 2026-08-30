import { EditorState, type Extension } from "@codemirror/state";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";

const KEYWORDS = [
  "abstract",
  "constructor",
  "data",
  "do",
  "eta-equality",
  "field",
  "forall",
  "hiding",
  "import",
  "in",
  "inductive",
  "infix",
  "infixl",
  "infixr",
  "instance",
  "interleaved",
  "let",
  "macro",
  "module",
  "mutual",
  "no-eta-equality",
  "open",
  "overlap",
  "pattern",
  "postulate",
  "primitive",
  "private",
  "public",
  "quote",
  "quoteContext",
  "quoteGoal",
  "quoteTerm",
  "record",
  "renaming",
  "rewrite",
  "syntax",
  "tactic",
  "unquote",
  "unquoteDecl",
  "unquoteDef",
  "using",
  "variable",
  "where",
  "with",
] as const;

const PRIMITIVES: Completion[] = [
  { label: "Set", type: "type", detail: "universe" },
  { label: "Prop", type: "type", detail: "universe" },
  { label: "Setω", type: "type", detail: "universe" },
  { label: "Level", type: "type", detail: "universe level" },
  { label: "lzero", type: "constant", detail: "level zero" },
  { label: "lsuc", type: "function", detail: "level successor" },
  { label: "_⊔_", type: "function", detail: "level join" },
];

const BUILTIN_EXPORTS: Record<string, readonly string[]> = {
  "Agda.Builtin.Bool": ["Bool", "false", "true"],
  "Agda.Builtin.Char": ["Char", "primCharEquality"],
  "Agda.Builtin.Equality": ["_≡_", "refl"],
  "Agda.Builtin.Float": ["Float"],
  "Agda.Builtin.Int": ["Int", "pos", "negsuc"],
  "Agda.Builtin.IO": ["IO"],
  "Agda.Builtin.Level": ["Level", "lzero", "lsuc", "_⊔_"],
  "Agda.Builtin.List": ["List", "[]", "_∷_"],
  "Agda.Builtin.Maybe": ["Maybe", "nothing", "just"],
  "Agda.Builtin.Nat": ["Nat", "zero", "suc", "_+_", "_-_", "_*_"],
  "Agda.Builtin.Sigma": ["Σ", "_,_", "fst", "snd"],
  "Agda.Builtin.String": ["String", "primStringAppend", "primStringEquality"],
  "Agda.Builtin.Unit": ["⊤", "tt"],
  "Agda.Builtin.Word": ["Word64"],
};

const IDENTIFIER = /[\p{L}\p{N}_'.-]*/u;
const ALL_IDENTIFIERS = /[\p{L}_][\p{L}\p{N}_'.-]*/gu;

function completionType(label: string): Completion["type"] {
  if (KEYWORDS.includes(label as (typeof KEYWORDS)[number])) return "keyword";
  if (/^[A-ZΣ⊤]/u.test(label)) return "type";
  if (label.includes(".")) return "namespace";
  if (/^[_].*[_]$/u.test(label)) return "function";
  return "variable";
}

function importedOptions(source: string): Completion[] {
  const options: Completion[] = [];
  const imports = source.matchAll(
    /^\s*(?:open\s+)?import\s+([\p{L}\p{N}_'.-]+)/gmu,
  );
  for (const [, moduleName] of imports) {
    options.push({
      label: moduleName,
      type: "namespace",
      detail: "imported module",
    });
    for (const label of BUILTIN_EXPORTS[moduleName] ?? []) {
      options.push({
        label,
        type: completionType(label),
        detail: moduleName,
      });
    }
  }
  return options;
}

function bufferOptions(source: string): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const match of source.matchAll(ALL_IDENTIFIERS)) {
    const label = match[0];
    if (label.length < 2 || seen.has(label)) continue;
    seen.add(label);
    options.push({
      label,
      type: completionType(label),
      detail: "current buffer",
    });
  }
  return options;
}

export function agdaCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(IDENTIFIER);
  if (!word || (!context.explicit && word.text.length < 2)) return null;

  const source = context.state.doc.toString();
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = source.slice(line.from, context.pos);
  if (/--[^\n]*$/u.test(beforeCursor) || source[word.from - 1] === "\\") {
    return null;
  }

  const options = new Map<string, Completion>();
  for (const keyword of KEYWORDS) {
    options.set(keyword, {
      label: keyword,
      type: "keyword",
      detail: "Agda keyword",
    });
  }
  for (const option of PRIMITIVES) options.set(option.label, option);
  for (const option of importedOptions(source)) options.set(option.label, option);
  for (const option of bufferOptions(source)) options.set(option.label, option);
  options.delete(word.text);

  return {
    from: word.from,
    options: [...options.values()],
    validFor: /^[\p{L}\p{N}_'.-]*$/u,
  };
}

export function agdaCompletions(): Extension {
  return EditorState.languageData.of(() => [
    { autocomplete: agdaCompletionSource },
  ]);
}
