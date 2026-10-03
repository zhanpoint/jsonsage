/** Canonical decimal equality without converting either digits or exponent to floats. */
export function numberKey(text: string): string {
  const [mantissa, exponent = '0'] = text.split(/[eE]/);
  const negative = mantissa.startsWith('-');
  const dot = mantissa.indexOf('.');
  const fractionLength = dot < 0 ? 0 : mantissa.length - dot - 1;
  const digits = mantissa.replace(/[-.]/g, '').replace(/^0+/, '');
  if (!digits) return '0';
  let end = digits.length;
  while (digits[end - 1] === '0') end--;
  const scale = BigInt(exponent) - BigInt(fractionLength) + BigInt(digits.length - end);
  return (negative ? '-' : '') + digits.slice(0, end) + 'e' + scale;
}
