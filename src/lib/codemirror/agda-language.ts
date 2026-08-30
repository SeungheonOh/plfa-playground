import {
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
  type StringStream,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";

interface AgdaStreamState {
  blockCommentDepth: number;
}

const keywords = new Set([
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
]);

function consumeBlockComment(stream: StringStream, state: AgdaStreamState) {
  while (!stream.eol()) {
    if (stream.match("{-")) state.blockCommentDepth++;
    else if (stream.match("-}")) {
      state.blockCommentDepth--;
      if (state.blockCommentDepth === 0) break;
    } else stream.next();
  }
  return "comment";
}

const agdaParser: StreamParser<AgdaStreamState> = {
  startState: () => ({ blockCommentDepth: 0 }),
  token(stream, state) {
    if (state.blockCommentDepth) return consumeBlockComment(stream, state);
    if (stream.eatSpace()) return null;
    if (stream.match("--")) {
      stream.skipToEnd();
      return "lineComment";
    }
    if (stream.match("{-")) {
      state.blockCommentDepth = 1;
      return consumeBlockComment(stream, state);
    }
    if (stream.match('"')) {
      let escaped = false;
      while (!stream.eol()) {
        const character = stream.next();
        if (character === '"' && !escaped) break;
        escaped = character === "\\" && !escaped;
        if (character !== "\\") escaped = false;
      }
      return "string";
    }
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[\p{L}_][\p{L}\p{N}_'₀-₉]*/u)) {
      const word = stream.current();
      if (keywords.has(word)) return "keyword";
      if (/^Set(?:ω|\d+)?$/.test(word) || word === "Prop") return "typeName";
      if (/^\p{Lu}/u.test(word)) return "typeName";
      return "variableName";
    }
    if (stream.match(/^[→←↔⇒∀λ≡≤≥⊎×⊥⊤∷∎⟨⟩=:+*/<>¬∧∨|!?.^-]+/u))
      return "operator";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "--", block: { open: "{-", close: "-}" } },
  },
};

export const agdaStreamLanguage = StreamLanguage.define(agdaParser);

export function agdaSourceLanguage() {
  return new LanguageSupport(agdaStreamLanguage);
}

export function literateAgdaLanguage() {
  return markdown({
    addKeymap: false,
    completeHTMLTags: false,
    pasteURLAsLink: false,
    codeLanguages: (info) =>
      info.trim().toLowerCase() === "agda" ? agdaStreamLanguage : null,
  });
}
