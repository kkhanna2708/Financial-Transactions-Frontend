export function toCents(str) {
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = unsigned.split('.');
  const cents = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0').slice(0, 2), 10);
  return (negative ? -1 : 1) * cents;
}

export function fromCents(n) {
  const negative = n < 0;
  const abs = Math.abs(n);
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${int}.${frac}`;
}
