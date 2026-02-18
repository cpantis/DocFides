/**
 * Mock data generators for pipeline simulation mode.
 * Produces realistic data matching the exact output structures
 * expected by each AI agent and consumed by the editor.
 */

import type { PipelineStage } from '@/types/pipeline';

export function getMockStageOutput(stage: PipelineStage): Record<string, unknown> {
  switch (stage) {
    case 'parser':
      return { parsed: 3, failed: 0, skipped: 0, documents: [] };
    case 'extract_analyze':
      return {
        project_data: getMockProjectData(),
        style_guide: getMockModelMap(),
        field_map: { ...getMockTemplateSchema(), ...getMockDraftPlan() },
      };
    case 'write_verify':
      return {
        ...getMockFieldCompletions(),
        ...getMockQualityReport(),
      };
    default:
      return {};
  }
}

export function getStageOutputField(stage: PipelineStage): string | null {
  switch (stage) {
    case 'parser': return null;
    case 'extract_analyze': return 'projectData';
    case 'write_verify': return 'fieldCompletions';
    default: return null;
  }
}

function getMockProjectData(): Record<string, unknown> {
  return {
    entities: {
      beneficiary: {
        company_name: 'SC Exemplu Consulting SRL',
        cui: 'RO12345678',
        reg_com: 'J40/1234/2020',
        address: 'Str. Victoriei nr. 10, București, Sector 1',
        iban: 'RO49AAAA1B31007593840000',
        bank: 'Banca Transilvania',
        representative: {
          name: 'Ion Popescu',
          role: 'Administrator',
          id_series: 'RD',
          id_number: '123456',
        },
      },
      contractor: {
        company_name: 'Construct Pro SRL',
        cui: 'RO87654321',
        reg_com: 'J35/5678/2019',
        address: 'Bd. Revoluției nr. 25, Timișoara, Timiș',
        iban: 'RO91BRDE350SV12345678',
        bank: 'BRD',
        representative: {
          name: 'Maria Ionescu',
          role: 'Director General',
          id_series: 'TM',
          id_number: '789012',
        },
      },
    },
    project: {
      title: 'Modernizarea infrastructurii de utilități publice',
      description: 'Proiectul vizează modernizarea și extinderea rețelei de apă și canalizare în zona metropolitană București.',
      location: 'Regiunea București-Ilfov',
      contract_number: 'CT-2026-0142',
    },
    financial: {
      budget: {
        total: 1250000,
        currency: 'lei',
        vat_included: true,
      },
      advance: {
        percentage: 30,
        amount: 375000,
      },
    },
    dates: {
      contract_date: '15.01.2026',
      start_date: '01.02.2026',
      end_date: '31.12.2026',
      delivery_date: '15.12.2026',
    },
    tables: [
      {
        name: 'Centralizator financiar',
        headers: ['Activitate', 'Cantitate', 'Preț unitar (lei)', 'Total (lei)'],
        rows: [
          ['Proiectare tehnică', '1', '150.000,00', '150.000,00'],
          ['Execuție lucrări', '1', '850.000,00', '850.000,00'],
          ['Supervizare', '11 luni', '22.727,27', '250.000,00'],
        ],
      },
    ],
  };
}

function getMockModelMap(): Record<string, unknown> {
  return {
    sections: [
      {
        title: 'Introducere',
        contentType: 'narrative',
        tone: 'formal',
        avgWordCount: 180,
        avgParagraphs: 2,
        conventions: ['voce pasivă', 'timpuri prezent'],
      },
      {
        title: 'Descrierea proiectului',
        contentType: 'mixed',
        tone: 'technical',
        avgWordCount: 350,
        avgParagraphs: 4,
        conventions: ['referințe legislative', 'specificații tehnice'],
      },
    ],
    globalStyle: {
      formality: 5,
      technicality: 4,
      sentenceLength: 'long',
      listStyle: 'numbered',
      referenceStyle: 'full',
    },
    rhetoricalPatterns: {
      openingPattern: 'Se prezintă obiectul și scopul documentului',
      transitionStyle: 'Fraze de tranziție între secțiuni',
      tableIntroStyle: 'Tabelul nr. {number} de mai jos prezintă',
      conclusionStyle: 'Se rezumă concluziile principale',
      crossRefStyle: 'Conform secțiunii X',
      listOrdering: 'importance',
      detailMap: { entities: 'granular', financial: 'granular' },
    },
    domainVocabulary: {
      preferredTerms: { contract: 'contract de servicii', work: 'lucrări' },
      standardPhrases: ['în conformitate cu', 'în baza prevederilor', 'conform legislației în vigoare'],
      excludedTerms: [],
    },
  };
}

function getMockTemplateSchema(): Record<string, unknown> {
  return {
    fields: [
      {
        id: 'field_beneficiary_name',
        location: { section: 'Părțile contractante', paragraph: 1 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'Denumirea beneficiarului',
        userHint: 'Numele complet al companiei beneficiare',
      },
      {
        id: 'field_beneficiary_cui',
        location: { section: 'Părțile contractante', paragraph: 1 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'CUI beneficiar',
        userHint: 'Codul unic de înregistrare',
      },
      {
        id: 'field_beneficiary_address',
        location: { section: 'Părțile contractante', paragraph: 1 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'Adresa beneficiarului',
        userHint: 'Sediul social al beneficiarului',
      },
      {
        id: 'field_contractor_name',
        location: { section: 'Părțile contractante', paragraph: 2 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'Denumirea contractorului',
        userHint: 'Numele complet al prestatorului de servicii',
      },
      {
        id: 'field_contractor_cui',
        location: { section: 'Părțile contractante', paragraph: 2 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'CUI contractor',
        userHint: 'Codul unic de înregistrare al contractorului',
      },
      {
        id: 'field_project_title',
        location: { section: 'Obiectul contractului', paragraph: 1 },
        expectedType: 'text',
        contentType: 'copy',
        hint: 'Titlul proiectului',
        userHint: 'Denumirea oficială a proiectului',
      },
      {
        id: 'field_project_description',
        location: { section: 'Obiectul contractului', paragraph: 2 },
        expectedType: 'narrative',
        contentType: 'narrative',
        hint: 'Descrierea detaliată a proiectului',
        userHint: 'Prezentare cuprinzătoare a obiectivelor și activităților',
        estimatedLength: '200-350 cuvinte',
      },
      {
        id: 'field_contract_value',
        location: { section: 'Valoarea contractului', paragraph: 1 },
        expectedType: 'text',
        contentType: 'computed',
        hint: 'Valoarea totală a contractului',
        userHint: 'Suma totală inclusiv TVA',
      },
      {
        id: 'field_contract_date',
        location: { section: 'Durata contractului', paragraph: 1 },
        expectedType: 'date',
        contentType: 'copy',
        hint: 'Data semnării contractului',
        userHint: 'Data la care a fost semnat contractul',
      },
      {
        id: 'field_execution_period',
        location: { section: 'Durata contractului', paragraph: 2 },
        expectedType: 'narrative',
        contentType: 'narrative',
        hint: 'Perioada de execuție',
        userHint: 'Descrierea perioadei de implementare cu termene',
        estimatedLength: '50-100 cuvinte',
      },
      {
        id: 'field_obligations',
        location: { section: 'Obligațiile părților', paragraph: 1 },
        expectedType: 'narrative',
        contentType: 'narrative',
        hint: 'Obligațiile principale ale părților',
        userHint: 'Prezentarea obligațiilor beneficiarului și contractorului',
        estimatedLength: '150-250 cuvinte',
      },
    ],
    conditionalSections: [],
    dynamicTables: [
      {
        tableId: 'financial_table',
        modelRowPath: 'tables[0]',
        dataSource: 'financial',
      },
    ],
    headerFooterPlaceholders: [
      { position: 'header', fieldId: 'field_project_title' },
      { position: 'footer', fieldId: 'field_contract_date' },
    ],
  };
}

function getMockDraftPlan(): Record<string, unknown> {
  return {
    fieldMappings: [
      { fieldId: 'field_beneficiary_name', type: 'copy', dataSource: 'entities.beneficiary.company_name', needsMultipleSuggestions: false },
      { fieldId: 'field_beneficiary_cui', type: 'copy', dataSource: 'entities.beneficiary.cui', needsMultipleSuggestions: false },
      { fieldId: 'field_beneficiary_address', type: 'copy', dataSource: 'entities.beneficiary.address', needsMultipleSuggestions: false },
      { fieldId: 'field_contractor_name', type: 'copy', dataSource: 'entities.contractor.company_name', needsMultipleSuggestions: false },
      { fieldId: 'field_contractor_cui', type: 'copy', dataSource: 'entities.contractor.cui', needsMultipleSuggestions: false },
      { fieldId: 'field_project_title', type: 'copy', dataSource: 'project.title', needsMultipleSuggestions: false },
      { fieldId: 'field_project_description', type: 'narrative', dataSource: 'project', styleGuidance: 'Ton formal, 200-350 cuvinte', needsMultipleSuggestions: false },
      { fieldId: 'field_contract_value', type: 'computed', dataSource: 'financial.budget', needsMultipleSuggestions: false },
      { fieldId: 'field_contract_date', type: 'copy', dataSource: 'dates.contract_date', needsMultipleSuggestions: false },
      { fieldId: 'field_execution_period', type: 'narrative', dataSource: 'dates', needsMultipleSuggestions: false },
      { fieldId: 'field_obligations', type: 'narrative', dataSource: 'project', needsMultipleSuggestions: false },
    ],
    unmappedFields: [],
    ambiguousFields: [],
  };
}

function getMockFieldCompletions(): Record<string, unknown> {
  return {
    fields: {
      field_beneficiary_name: 'SC Exemplu Consulting SRL',
      field_beneficiary_cui: 'RO12345678',
      field_beneficiary_address: 'Str. Victoriei nr. 10, București, Sector 1',
      field_contractor_name: 'Construct Pro SRL',
      field_contractor_cui: 'RO87654321',
      field_project_title: 'Modernizarea infrastructurii de utilități publice',
      field_project_description:
        'Prezentul proiect vizează modernizarea și extinderea rețelei de alimentare cu apă și canalizare ' +
        'în zona metropolitană București-Ilfov. Obiectivele principale includ reabilitarea conductelor existente ' +
        'pe o lungime de aproximativ 45 km, instalarea de stații de pompare noi și modernizarea stației de tratare ' +
        'a apei din sectorul 3.\n\n' +
        'Activitățile proiectului sunt structurate în trei faze principale: proiectare tehnică (lunile 1-2), ' +
        'execuție lucrări (lunile 3-10) și supervizare și recepție (lunile 11-12). Toate lucrările vor fi realizate ' +
        'în conformitate cu standardele tehnice în vigoare și normativele aplicabile domeniului infrastructurii de utilități.\n\n' +
        'Beneficiile preconizate includ creșterea capacității de distribuție cu 30%, reducerea pierderilor tehnice ' +
        'de la 42% la sub 20% și îmbunătățirea calității apei distribuite către aproximativ 150.000 de locuitori.',
      field_contract_value: '1.250.000,00 lei (inclusiv TVA)',
      field_contract_date: '15.01.2026',
      field_execution_period:
        'Contractul se execută pe o perioadă de 11 luni, cu începere de la data de 01.02.2026 ' +
        'și finalizare la data de 31.12.2026. Termenul de livrare a documentației finale este 15.12.2026.',
      field_obligations:
        'Beneficiarul se obligă să pună la dispoziția contractorului toate documentele și informațiile necesare ' +
        'pentru buna desfășurare a activităților, să asigure accesul la amplasamentele de lucru și să efectueze ' +
        'plățile conform graficului de plăți convenit.\n\n' +
        'Contractorul se obligă să execute lucrările în conformitate cu specificațiile tehnice din caietul de sarcini, ' +
        'să respecte termenele de execuție, să asigure personalul calificat și echipamentele necesare, și să ' +
        'prezinte rapoarte lunare de progres. De asemenea, contractorul va asigura garanția lucrărilor ' +
        'pentru o perioadă de 24 de luni de la recepția finală.',
    },
  };
}

function getMockQualityReport(): Record<string, unknown> {
  return {
    global_score: 91,
    errors: [],
    warnings: [
      {
        fieldId: 'field_project_description',
        issue: 'Descrierea proiectului conține 127 de cuvinte, sub pragul recomandat de 200',
        severity: 'warning',
      },
    ],
    suggestions: [
      'Se recomandă extinderea descrierii proiectului cu detalii despre impactul social',
    ],
    field_scores: {
      field_beneficiary_name: { accuracy: 100, style: 95, completeness: 100, coherence: 100 },
      field_beneficiary_cui: { accuracy: 100, style: 90, completeness: 100, coherence: 100 },
      field_beneficiary_address: { accuracy: 95, style: 90, completeness: 100, coherence: 100 },
      field_contractor_name: { accuracy: 100, style: 95, completeness: 100, coherence: 100 },
      field_contractor_cui: { accuracy: 100, style: 90, completeness: 100, coherence: 100 },
      field_project_title: { accuracy: 100, style: 95, completeness: 100, coherence: 100 },
      field_project_description: { accuracy: 90, style: 88, completeness: 78, coherence: 92 },
      field_contract_value: { accuracy: 100, style: 85, completeness: 100, coherence: 100 },
      field_contract_date: { accuracy: 100, style: 90, completeness: 100, coherence: 100 },
      field_execution_period: { accuracy: 95, style: 90, completeness: 92, coherence: 95 },
      field_obligations: { accuracy: 88, style: 92, completeness: 85, coherence: 90 },
    },
    data_leakage_check: {
      passed: true,
      violations: [],
    },
  };
}
