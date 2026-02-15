/**
 * Simple field placeholder replacement in DOCX templates.
 * Handles patterns like [Company Name], {{date}}, _______ etc.
 */

export interface PlaceholderReplacement {
  placeholder: string;
  value: string;
}

export function replaceTextPlaceholders(
  text: string,
  replacements: PlaceholderReplacement[]
): string {
  let result = text;
  for (const { placeholder, value } of replacements) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
}
