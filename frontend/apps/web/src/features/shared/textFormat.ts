/**
 * Ensures the first letter of the string is uppercase.
 * Returns the string unchanged if empty or already capitalized.
 */
export function capitalizeFirstLetter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
