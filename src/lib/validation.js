export function validateTransaction({ customer_id, type, amount }) {
  const errors = {};

  if (!customer_id || !String(customer_id).trim()) {
    errors.customer_id = 'Select a customer';
  }

  if (!type || !String(type).trim()) {
    errors.type = 'Select a type';
  }

  const trimmedAmount = amount == null ? '' : String(amount).trim();
  if (!trimmedAmount) {
    errors.amount = 'Amount is required';
  } else if (!/^-?\d+(\.\d+)?$/.test(trimmedAmount)) {
    errors.amount = 'Enter a valid amount';
  } else if (trimmedAmount.startsWith('-') || !/[1-9]/.test(trimmedAmount)) {
    errors.amount = 'Amount must be greater than 0';
  } else if (/\.\d{3,}$/.test(trimmedAmount)) {
    errors.amount = 'Amount can have at most 2 decimal places';
  }

  return errors;
}
