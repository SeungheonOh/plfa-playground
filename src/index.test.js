/// <reference types="vitest/globals" />

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { agdaCompletionSource } from "$lib/codemirror/completion";
import { browserAgdaSource } from "$lib/agda/browser-source";

function complete(source, explicit = true) {
  const state = EditorState.create({ doc: source });
  return agdaCompletionSource(
    new CompletionContext(state, state.doc.length, explicit),
  );
}

describe("Agda completion", () => {
  it("suggests names declared in the current buffer", () => {
    const result = complete("identity : Set\nidentity = Set\niden");
    expect(result.options.map((option) => option.label)).toContain("identity");
    expect(result.options.map((option) => option.label)).not.toContain("iden");
  });

  it("suggests exports from open builtin imports", () => {
    const result = complete("open import Agda.Builtin.Bool\ntr");
    expect(result.options.map((option) => option.label)).toContain("true");
  });
});

describe("PLFA browser source", () => {
  it("uses narrow modules without changing any source offsets", () => {
    const source = `module plfa.part1.Sample where
open import Function using (_∘_)
open import Data.Product using (_×_)
open import Data.Nat.Properties using (+-comm)
import Relation.Binary.PropositionalEquality as Eq
open Eq.≡-Reasoning
answer = {!  !}
`;
    const browserSource = browserAgdaSource(
      "/plfa/part1/Sample.lagda.md",
      source,
    );
    expect(browserSource).toHaveLength(source.length);
    expect(browserSource.indexOf("answer")).toBe(source.indexOf("answer"));
    expect(browserSource).toContain("open import plfa.Fun");
    expect(browserSource).toContain("open import plfa.Product");
    expect(browserSource).toContain("open import plfa.NatProps");
    expect(browserSource).toContain("plfa.browser.PropositionalEquality");
  });

  it("omits reference-only stdlib imports without moving later text", () => {
    const source = `module plfa.part1.Sample where

# Standard library

\`\`\`agda
import Data.Product using (_×_; proj₁; proj₂)
\`\`\`

# Unicode
ending : Set
ending = Set
`;
    const browserSource = browserAgdaSource(
      "/plfa/part1/Sample.lagda.md",
      source,
    );
    expect(browserSource).toHaveLength(source.length);
    expect(new TextEncoder().encode(browserSource)).toHaveLength(
      new TextEncoder().encode(source).length,
    );
    expect(browserSource.indexOf("ending")).toBe(source.indexOf("ending"));
    expect(browserSource).toContain("```agda\n--port Data.Product");
  });

  it("never transforms ordinary playground files", () => {
    const source = "open import Data.Product\n";
    expect(browserAgdaSource("/Main.agda", source)).toBe(source);
  });
});
