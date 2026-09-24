import { formatMoney } from '../lib/money.js';

export default function Money({ value }) {
  return <span className="money">{formatMoney(value)}</span>;
}
