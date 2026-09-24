export function fieldErrorsFromDetails(details) {
  if (!details) return {};

  if (details.fields && typeof details.fields === 'object' && !Array.isArray(details.fields)) {
    const out = {};
    for (const [field, msg] of Object.entries(details.fields)) {
      out[field] = Array.isArray(msg) ? msg[0] : msg;
    }
    return out;
  }

  if (Array.isArray(details)) {
    const out = {};
    for (const item of details) {
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.loc) && item.msg) {
        const field = item.loc[item.loc.length - 1];
        if (field) out[field] = item.msg;
      } else if (item.field && item.message) {
        out[item.field] = item.message;
      }
    }
    return out;
  }

  if (typeof details === 'object') {
    // {amount: 'msg' | ['msg']} shape, excluding the {fields:...} case handled above
    const out = {};
    let matched = false;
    for (const [field, msg] of Object.entries(details)) {
      if (field === 'fields') continue;
      if (typeof msg === 'string' || (Array.isArray(msg) && typeof msg[0] === 'string')) {
        out[field] = Array.isArray(msg) ? msg[0] : msg;
        matched = true;
      }
    }
    if (matched) return out;
  }

  return {};
}
