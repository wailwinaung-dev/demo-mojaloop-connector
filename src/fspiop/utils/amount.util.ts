/**
 * Formats a numeric or currency string into Mojaloop FSPIOP canonical amount representation.
 * Mojaloop specification regex: ^([0]|([1-9][0-9]{0,17}))([.][0-9]{0,3}[1-9])?$
 *
 * Rules:
 * 1. Integer part must not have leading zeros (unless zero itself).
 * 2. Trailing decimal zeros are forbidden (e.g., "100.00" -> "100", "100.50" -> "100.5").
 * 3. Preserves significant fractional amounts (e.g., "100.25", "0.05").
 */
export function formatMojaloopAmount(amount: string | number): string {
  if (amount === undefined || amount === null) {
    return '0';
  }

  const str = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (!str.includes('.')) {
    return str;
  }

  const [integerPart, decimalPart] = str.split('.');
  if (!decimalPart) {
    return integerPart;
  }

  const trimmedDecimals = decimalPart.replace(/0+$/, '');
  return trimmedDecimals.length > 0 ? `${integerPart}.${trimmedDecimals}` : integerPart;
}
