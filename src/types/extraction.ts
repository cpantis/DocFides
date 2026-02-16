export interface EntityData {
  company_name: string;
  cui: string;
  address: string;
  representative: {
    name: string;
    role: string;
    id_series?: string;
    id_number?: string;
  };
  contact?: {
    phone: string;
    email: string;
  };
  source_file: string;
}

export interface ProjectData {
  entities: {
    beneficiary?: EntityData;
    contractor?: EntityData;
    subcontractors?: EntityData[];
    unassigned?: EntityData[];
  };
  project: {
    title: string;
    description: string;
    location: string;
  };
  financial: {
    budget: {
      total: number;
      currency: string;
    };
  };
  dates: Record<string, string>;
  tables: {
    name: string;
    headers: string[];
    rows: string[][];
  }[];
}

export interface ExtractionBlock {
  id: string;
  type: 'text' | 'table' | 'heading' | 'list';
  content: string | TableData;
  source: 'tika' | 'tesseract' | 'easyocr' | 'img2table';
  confidence: number;
  page: number;
  position: { x: number; y: number; w: number; h: number };
  warnings?: string[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
  mergedCells?: { row: number; col: number; rowSpan: number; colSpan: number }[];
  confidence: number;
}

export type ValidationIssueType =
  | 'invalid_format'
  | 'date_invalid'
  | 'iban_invalid'
  | 'caen_invalid'
  | 'contradiction'
  | 'cross_doc_mismatch'
  | 'missing_critical'
  | 'sum_mismatch';

export interface ValidationIssue {
  field: string;
  type: ValidationIssueType;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ModelMap {
  sections: {
    title: string;
    contentType: 'narrative' | 'table' | 'list' | 'enumeration' | 'mixed';
    tone: 'formal' | 'technical' | 'accessible' | 'mixed';
    avgWordCount: number;
    avgParagraphs: number;
    conventions: string[];
  }[];
  globalStyle: {
    formality: 1 | 2 | 3 | 4 | 5;
    technicality: 1 | 2 | 3 | 4 | 5;
    sentenceLength: 'short' | 'medium' | 'long';
    listStyle: 'bullets' | 'numbered' | 'inline';
    referenceStyle: string;
  };
  rhetoricalPatterns: {
    openingPattern: string;
    transitionStyle: string;
    tableIntroStyle: string;
    conclusionStyle: string;
    crossRefStyle: string;
    listOrdering: 'chronological' | 'importance' | 'thematic';
    detailMap: Record<string, 'high-level' | 'moderate' | 'granular'>;
  };
  domainVocabulary: {
    preferredTerms: Record<string, string>;
    standardPhrases: string[];
    excludedTerms: string[];
  };
}

export type FieldContentType = 'copy' | 'narrative' | 'table_fill' | 'computed' | 'conditional';

export interface TemplateField {
  id: string;
  location: {
    section: string;
    paragraph?: number;
    table?: { row: number; col: number };
  };
  expectedType: 'text' | 'number' | 'date' | 'list' | 'narrative';
  contentType: FieldContentType;
  hint: string;
  userHint?: string;
  estimatedLength?: string;
}

export interface QualityReport {
  global_score: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: string[];
  field_scores: Record<string, {
    accuracy: number;
    style: number;
    completeness: number;
    coherence: number;
  }>;
}
