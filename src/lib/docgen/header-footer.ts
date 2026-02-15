/**
 * Header/footer placeholder replacement.
 * Replaces placeholders while preserving font/size/alignment.
 */

export interface HeaderFooterReplacement {
  placeholder: string;
  value: string;
}

export function processHeaderFooter(
  text: string,
  replacements: HeaderFooterReplacement[]
): string {
  let result = text;
  for (const { placeholder, value } of replacements) {
    result = result.replaceAll(placeholder, value);
  }
  // [Page] and [Total Pages] handled by native DOCX field codes
  return result;
}
