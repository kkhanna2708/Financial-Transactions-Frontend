export function formatMoney(str) {
  if (typeof str !== 'string' || !/^-?\d+(\.\d+)?$/.test(str)) return str;
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = unsigned.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  let int = intPart.replace(/^0+(?=\d)/, '');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return `${sign}${int}.${frac}`;
}
