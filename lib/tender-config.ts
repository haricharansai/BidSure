// Tender-type workflow configuration (D5): each type controls required stages,
// live-bidding behaviour and next-step copy shown in the UI.

export type TenderType = 'open' | 'limited' | 'single' | 'e-reverse-auction'

export interface TenderTypeConfig {
  label: string
  liveBidding: boolean
  stages: string[]
  nextStep: string
  description: string
}

export const TENDER_TYPE_CONFIG: Record<TenderType, TenderTypeConfig> = {
  open: {
    label: 'Open Tender',
    liveBidding: false,
    stages: ['PUBLISHED', 'CLOSED', 'AWARDED'],
    nextStep: 'Bids are evaluated after the submission deadline.',
    description: 'Anyone meeting the eligibility criteria may participate.',
  },
  limited: {
    label: 'Limited Tender',
    liveBidding: false,
    stages: ['PUBLISHED', 'CLOSED', 'AWARDED'],
    nextStep: 'Only invited sellers may submit before the deadline.',
    description: 'Restricted to pre-qualified or invited sellers.',
  },
  single: {
    label: 'Single Tender',
    liveBidding: false,
    stages: ['PUBLISHED', 'CLOSED', 'AWARDED'],
    nextStep: 'Direct negotiation with a single seller.',
    description: 'Negotiated with one identified seller.',
  },
  'e-reverse-auction': {
    label: 'e-Reverse Auction',
    liveBidding: true,
    stages: ['PUBLISHED', 'CLOSED', 'AUCTION_ACTIVE', 'AUCTION_CLOSED', 'AWARDED'],
    nextStep: 'Qualified bidders compete with descending bids after evaluation.',
    description: 'Two-stage: qualification evaluation, then live descending-bid auction.',
  },
}

export function isTenderType(v: string): v is TenderType {
  return v === 'open' || v === 'limited' || v === 'single' || v === 'e-reverse-auction'
}

export const STAGE_LABELS: Record<string, string> = {
  PUBLISHED: 'Accepting submissions',
  CORRIGENDUM: 'Corrigendum issued — amended terms',
  CLOSED: 'Submission closed — evaluating',
  EVALUATED: 'Evaluated',
  AUCTION_ACTIVE: 'Live auction running',
  AUCTION_CLOSED: 'Auction closed',
  AUCTION_FAILED: 'Auction could not start',
  EVALUATION_FAILED: 'No qualified bidders',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
}

// Default GeM document catalogue (blueprint Rules 1–3) seeded onto every new tender.
export interface DocTemplate {
  name: string
  description: string
  classification: 'MANDATORY' | 'CONDITIONAL' | 'SUPPORTING'
  conditionKey?: string
}

export const DEFAULT_DOC_TEMPLATES: DocTemplate[] = [
  { name: 'pan', description: 'Permanent Account Number card', classification: 'MANDATORY' },
  { name: 'gstin', description: 'GST registration certificate', classification: 'MANDATORY' },
  { name: 'turnover', description: 'CA-certified turnover certificate with UDIN', classification: 'MANDATORY' },
  { name: 'audited', description: 'Audited balance sheets — last 3 years', classification: 'MANDATORY' },
  { name: 'board', description: 'Board resolution / power of attorney', classification: 'MANDATORY' },
  { name: 'emd', description: 'EMD / bid security bank guarantee (required only when EMD applies)', classification: 'CONDITIONAL', conditionKey: 'emd' },
  { name: 'udyam', description: 'Udyam / MSE registration (claiming MSE preference or EMD exemption)', classification: 'CONDITIONAL', conditionKey: 'msme' },
  { name: 'startup', description: 'DPIIT startup recognition (claiming turnover/experience waiver)', classification: 'CONDITIONAL', conditionKey: 'startup' },
  { name: 'maf', description: 'Manufacturer authorization form (dealers/resellers)', classification: 'CONDITIONAL', conditionKey: 'reseller' },
  { name: 'mii', description: 'Make in India local content declaration (claiming Class-I/II status)', classification: 'CONDITIONAL', conditionKey: 'mii' },
  { name: 'iso', description: 'ISO certification', classification: 'SUPPORTING' },
  { name: 'experience', description: 'Past experience / completion certificates', classification: 'SUPPORTING' },
]

