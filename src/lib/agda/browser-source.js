const moduleAliases = [
  ["Function", "plfa.Fun"],
  ["Data.Product", "plfa.Product"],
  ["Data.Sum", "plfa.Sum"],
  ["Data.Unit", "plfa.Unit"],
  ["Data.Bool", "plfa.Bool"],
  ["Data.Nat.Base", "plfa.Nat"],
  ["Data.Nat.Properties", "plfa.NatProps"],
  ["Data.String", "plfa.String"],
];

export const browserAgdaModules = {
  "plfa/Fun.agda": `module plfa.Fun where
open import Function.Base public
`,
  "plfa/Product.agda": `module plfa.Product where
open import Data.Product.Base public
`,
  "plfa/Sum.agda": `module plfa.Sum where
open import Data.Sum.Base public
`,
  "plfa/Unit.agda": `module plfa.Unit where
open import Data.Unit.Base public
`,
  "plfa/Bool.agda": `module plfa.Bool where
open import Data.Bool.Base public
`,
  "plfa/Nat.agda": `module plfa.Nat where
open import Agda.Builtin.Nat public
  using (zero; suc; _+_; _*_)
  renaming (Nat to ℕ; _-_ to _∸_)

infixr 8 _^_
_^_ : ℕ → ℕ → ℕ
m ^ zero  = 1
m ^ suc n = m * (m ^ n)

infix 4 _≤_ _<_
data _≤_ : ℕ → ℕ → Set where
  z≤n : ∀ {n} → zero ≤ n
  s≤s : ∀ {m n} → m ≤ n → suc m ≤ suc n

_<_ : ℕ → ℕ → Set
m < n = suc m ≤ n

pattern z<s {n} = s≤s (z≤n {n})
pattern s<s {m} {n} m<n = s≤s {m} {n} m<n

open import Relation.Nullary using (Dec; yes; no)

infix 4 _≤?_
_≤?_ : ∀ m n → Dec (m ≤ n)
zero  ≤? n     = yes z≤n
suc m ≤? zero  = no (λ ())
suc m ≤? suc n with m ≤? n
... | yes m≤n = yes (s≤s m≤n)
... | no  m≰n = no λ { (s≤s m≤n) → m≰n m≤n }
`,
  "plfa/NatProps.agda": `module plfa.NatProps where

open import Agda.Builtin.Nat using (Nat; zero; suc; _+_; _*_)
open import Agda.Builtin.Equality using (_≡_; refl)

sym : ∀ {A : Set} {x y : A} → x ≡ y → y ≡ x
sym refl = refl

cong : ∀ {A B : Set} (f : A → B) {x y} → x ≡ y → f x ≡ f y
cong f refl = refl

+-suc : ∀ m n → m + suc n ≡ suc (m + n)
+-suc zero n = refl
+-suc (suc m) n = cong suc (+-suc m n)

+-assoc : ∀ m n o → (m + n) + o ≡ m + (n + o)
+-assoc zero n o = refl
+-assoc (suc m) n o = cong suc (+-assoc m n o)

+-identityˡ : ∀ n → zero + n ≡ n
+-identityˡ n = refl

+-identityʳ : ∀ n → n + zero ≡ n
+-identityʳ zero = refl
+-identityʳ (suc n) = cong suc (+-identityʳ n)

+-comm : ∀ m n → m + n ≡ n + m
+-comm zero n = sym (+-identityʳ n)
+-comm (suc m) n rewrite +-comm m n | sym (+-suc n m) = refl

*-zeroʳ : ∀ n → n * zero ≡ zero
*-zeroʳ zero = refl
*-zeroʳ (suc n) = *-zeroʳ n

*-suc : ∀ m n → m * suc n ≡ m + m * n
*-suc zero n = refl
*-suc (suc m) n
  rewrite *-suc m n
        | sym (+-assoc n m (m * n))
        | +-comm n m
        | +-assoc m n (m * n)
  = refl

*-identityˡ : ∀ n → 1 * n ≡ n
*-identityˡ n = +-identityʳ n

*-identityʳ : ∀ n → n * 1 ≡ n
*-identityʳ zero = refl
*-identityʳ (suc n) = cong suc (*-identityʳ n)

*-comm : ∀ m n → m * n ≡ n * m
*-comm zero n = sym (*-zeroʳ n)
*-comm (suc m) n rewrite *-comm m n | sym (*-suc n m) = refl

*-distribʳ-+ : ∀ m n o → (n + o) * m ≡ n * m + o * m
*-distribʳ-+ m zero o = refl
*-distribʳ-+ m (suc n) o
  rewrite *-distribʳ-+ m n o
        | sym (+-assoc m (n * m) (o * m))
  = refl

*-assoc : ∀ m n o → (m * n) * o ≡ m * (n * o)
*-assoc zero n o = refl
*-assoc (suc m) n o
  rewrite *-distribʳ-+ o n (m * n)
        | *-assoc m n o
  = refl
`,
  "plfa/String.agda": `module plfa.String where

open import Agda.Builtin.Char using (Char; primCharToNat)
open import Agda.Builtin.Char.Properties using (primCharToNatInjective)
open import Agda.Builtin.Equality using (_≡_; refl)
open import Agda.Builtin.List using (List; []; _∷_)
open import Agda.Builtin.Nat using (Nat; zero; suc)
open import Agda.Builtin.String public using (String)
open import Agda.Builtin.String as String using (primStringToList)
open import Agda.Builtin.String.Properties using (primStringToListInjective)
open import Relation.Nullary using (Dec; yes; no)

cong : ∀ {A B : Set} (f : A → B) {x y} → x ≡ y → f x ≡ f y
cong f refl = refl

nat-eq? : ∀ (x y : Nat) → Dec (x ≡ y)
nat-eq? zero zero = yes refl
nat-eq? zero (suc y) = no (λ ())
nat-eq? (suc x) zero = no (λ ())
nat-eq? (suc x) (suc y) with nat-eq? x y
... | yes refl = yes refl
... | no x≢y = no λ { refl → x≢y refl }

char-eq? : ∀ (x y : Char) → Dec (x ≡ y)
char-eq? x y with nat-eq? (primCharToNat x) (primCharToNat y)
... | yes p = yes (primCharToNatInjective x y p)
... | no p = no λ q → p (cong primCharToNat q)

list-eq? : ∀ (xs ys : List Char) → Dec (xs ≡ ys)
list-eq? [] [] = yes refl
list-eq? [] (y ∷ ys) = no (λ ())
list-eq? (x ∷ xs) [] = no (λ ())
list-eq? (x ∷ xs) (y ∷ ys) with char-eq? x y | list-eq? xs ys
... | yes refl | yes refl = yes refl
... | no x≢y | _ = no λ { refl → x≢y refl }
... | _ | no xs≢ys = no λ { refl → xs≢ys refl }

infix 4 _≟_
_≟_ : ∀ (x y : String) → Dec (x ≡ y)
x ≟ y with list-eq? (primStringToList x) (primStringToList y)
... | yes p = yes (primStringToListInjective x y p)
... | no p = no λ q → p (cong primStringToList q)
`,
  "plfa/browser/EqualityCore.agda": `module plfa.browser.EqualityCore where
open import Relation.Binary.PropositionalEquality.Core public
`,
  "plfa/browser/PropositionalEquality.agda": `module plfa.browser.PropositionalEquality where
open import Relation.Binary.PropositionalEquality.Core public
open import Relation.Binary.PropositionalEquality.Properties public
`,
};

/** @param {string} source @param {string} moduleName @param {string} replacement */
function replaceImport(source, moduleName, replacement) {
  if (replacement.length > moduleName.length) {
    throw new Error(`Browser module alias ${replacement} is too long`);
  }
  const positionCompatible = replacement.padEnd(moduleName.length, " ");
  const escaped = moduleName.replaceAll(".", "\\.");
  return source.replace(
    new RegExp(`(^\\s*(?:open\\s+)?import\\s+)${escaped}(?=\\s|$)`, "gm"),
    `$1${positionCompatible}`,
  );
}

/** @param {string} source */
function stripStandardLibraryReferences(source) {
  const heading = /^# Standard [Ll]ibrary\s*$/gm.exec(source);
  if (!heading) return source;
  const sectionStart = heading.index + heading[0].length;
  const nextHeading = /^# /gm;
  nextHeading.lastIndex = sectionStart;
  const sectionEnd = nextHeading.exec(source)?.index ?? source.length;
  const section = source
    .slice(sectionStart, sectionEnd)
    .replace(
      /(```agda[^\n]*\n)([\s\S]*?)(```)/g,
      (block, opening, code, closing) => {
        const meaningful = code.replace(/--.*$/gm, "").trim();
        if (!meaningful.startsWith("import ") || code.length < 4) return block;
        // These end-of-chapter blocks only cross-reference stdlib names and are
        // never opened or used by a proof. Replace the first two ASCII bytes on
        // every non-empty line with `--`; all later UTF-8 positions stay exact.
        const commented = code.replace(/^(.{2})/gm, "--");
        return `${opening}${commented}${closing}`;
      },
    );
  return source.slice(0, sectionStart) + section + source.slice(sectionEnd);
}

/**
 * Use smaller, official stdlib contents modules for PLFA checks. Every alias
 * has exactly the same width as the visible module name, preserving all UTF-8
 * source positions used by highlighting, errors, and interaction points.
 * @param {string} filePath
 * @param {string} source
 */
export function browserAgdaSource(filePath, source) {
  if (!filePath.startsWith("/plfa/")) return source;

  let result = stripStandardLibraryReferences(source);
  for (const [moduleName, alias] of moduleAliases) {
    result = replaceImport(result, moduleName, alias);
  }

  result = replaceImport(result, "Data.Nat", "plfa.Nat");

  const equalityAlias = source.includes("Eq.≡-Reasoning")
    ? "plfa.browser.PropositionalEquality"
    : "plfa.browser.EqualityCore";
  return replaceImport(
    result,
    "Relation.Binary.PropositionalEquality",
    equalityAlias,
  );
}
