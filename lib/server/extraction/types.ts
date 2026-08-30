// Typed extracted-document data (plan §5). The verification engine consumes
// only these structured shapes — never the raw bytes or a specific provider.

/** Source evidence retained for one extracted field (plan §11). */
export interface FieldEvidence {
  field: string
  value: string | number
  excerpt: string
  page: number
  confidence: number
}

/** Classification evidence: which pattern fired and where (plan §13). */
export interface ClassificationEvidence {
  pattern: string
  excerpt: string
}

export interface ClassificationResult {
  docType: DocTypeName
  confidence: number
  evidence: ClassificationEvidence[]
}

export interface ExtractInput {
  docType: DocTypeName
  buffer: Buffer
  mimeType: string
  fileName: string
}

/**
 * Extraction outcome. Rich fields (evidence/pageTexts/classification/
 * missing/uncertain) are populated by the real OCR provider; the MOCK dev
 * adapter only fills the core four. `missing` lists required fields that were
 * not found at all; `uncertain` lists fields whose confidence fell below the
 * threshold — both route to NEEDS_REVIEW, never to a guessed value.
 */
export interface ExtractOutcome {
  status: 'DONE' | 'FAILED'
  confidence: number | null
  fields: Record<string, unknown>
  error: string | null
  evidence?: FieldEvidence[]
  pageTexts?: string[]
  classification?: ClassificationResult | null
  missing?: string[]
  uncertain?: string[]
}

export type DocTypeName =
  | 'gstin' | 'pan' | 'udyam' | 'turnover' | 'audited' | 'emd' | 'mii'
  | 'iso' | 'experience' | 'startup' | 'maf' | 'board' | 'mca' | 'generic'

export interface ExtractedGst {
  gstin: string
  legalName: string
  tradeName?: string
  registrationDate?: string
  status?: string
  stateCode?: string
}

export interface ExtractedPan {
  pan: string
  name: string
  entityType?: string
}

export interface ExtractedUdyam {
  udyamNo: string
  enterpriseName: string
  orgType?: string
  nicCode?: string
  registrationDate?: string
  status?: string
}

export interface ExtractedTurnover {
  udin: string
  certDate?: string
  caName?: string
  membershipNo?: string
  turnoverCr?: number
  fy?: string
}

export interface ExtractedAudited {
  fy?: string
  auditedPnlCr?: number
  netWorthCr?: number
  auditorName?: string
}

export interface ExtractedEmd {
  bgNumber?: string
  issuingBank?: string
  amountCr?: number
  validTill?: string
  claimPeriodDays?: number
}

export interface ExtractedMii {
  localContentPct?: number
  declaredBy?: string
}

export interface ExtractedTemporal {
  issuer?: string
  issuedOn?: string
  validTill?: string
  certNumber?: string
}

export interface ExtractedStartup {
  dpiitNumber?: string
  recognitionDate?: string
  validTill?: string
}

export interface ExtractedMaf {
  oemName?: string
  resellerName?: string
  validTill?: string
}

export interface ExtractedBoard {
  signerName?: string
  designation?: string
  date?: string
}

export interface ExtractedMca {
  cin: string
  companyName?: string
  status?: string
  incorporationDate?: string
  directors?: string[]
}

export interface ExtractedGeneric {
  [field: string]: string | number | boolean | null | undefined
}

/** Union of structured extraction payloads by doc type. */
export type ExtractedDocumentData =
  | { docType: 'gstin'; data: ExtractedGst }
  | { docType: 'pan'; data: ExtractedPan }
  | { docType: 'udyam'; data: ExtractedUdyam }
  | { docType: 'turnover'; data: ExtractedTurnover }
  | { docType: 'audited'; data: ExtractedAudited }
  | { docType: 'emd'; data: ExtractedEmd }
  | { docType: 'mii'; data: ExtractedMii }
  | { docType: 'iso'; data: ExtractedTemporal }
  | { docType: 'experience'; data: ExtractedTemporal }
  | { docType: 'startup'; data: ExtractedStartup }
  | { docType: 'maf'; data: ExtractedMaf }
  | { docType: 'board'; data: ExtractedBoard }
  | { docType: 'mca'; data: ExtractedMca }
  | { docType: 'generic'; data: ExtractedGeneric }
