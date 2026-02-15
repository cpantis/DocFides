/**
 * Conditional section evaluation for DOCX export.
 * Omits sections cleanly when conditions aren't met.
 */

export interface ConditionalSection {
  sectionId: string;
  condition: string;
  includeHeading: boolean;
}

export function evaluateCondition(
  condition: string,
  projectData: Record<string, unknown>
): boolean {
  // Safe evaluation of simple conditions
  // Supports: "entities.subcontractors.length > 0", "financial.budget.total > 0"
  try {
    const parts = condition.split(' ');
    if (parts.length !== 3) return false;

    const [path, operator, rawValue] = parts;
    const value = getNestedValue(projectData, path!);
    const compareValue = Number(rawValue);

    switch (operator) {
      case '>': return Number(value) > compareValue;
      case '<': return Number(value) < compareValue;
      case '>=': return Number(value) >= compareValue;
      case '<=': return Number(value) <= compareValue;
      case '==': return String(value) === rawValue;
      case '!=': return String(value) !== rawValue;
      default: return false;
    }
  } catch {
    return false;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
