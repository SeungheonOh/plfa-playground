import z from 'zod'

// the plot: we convert the LSP-encoded information to the output produced by Agda's JSON-interaction mode

const _alsIsTokenBasedSchema = z.boolean().transform(t => t ? 'TokenBased' : 'NotOnlyTokenBased')

export const alsDefinitionSiteSchema = z.tuple([
  z.string(),
  z.int(),
]).transform(([filepath, position]) => ({ filepath, position }))

export const alsHighlightingInfoSchema = z.tuple([
  z.int(),
  z.int(),
  z.array(z.string()),
  _alsIsTokenBasedSchema,
  z.string(),
  z.nullable(alsDefinitionSiteSchema),
]).transform(
  ([from, to, atoms, tokenBased, note, definitionSite]) => ({
    range: [from, to],
    definitionSite,
    atoms,
    tokenBased: /** @type {typeof tokenBased} */(tokenBased),
    note,
  }))

/** @typedef {z.output<typeof alsHighlightingInfoSchema>} AgdaHighlightingInfoItem */

export const alsHighlightingInfosDirectSchema = z.tuple([
  z.boolean(),  // keep?
  z.array(alsHighlightingInfoSchema),
]).transform(([keep, payload]) => ({
  kind: 'HighlightingInfo',
  info: {
    payload,
    remove: !keep,
  },
  direct: true,
}))

export const alsInteractionPointsSchema = z.array(
  z.int()
)
