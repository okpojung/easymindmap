import { formatPhone } from '@/utils/countryCodes';

// The browser can autofill an international number even with a separate country selector.
// Do not silently truncate an overlong paste to another valid Korean number.
export function formatSignupPhone(dial: string, raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (dial === '82' && /^\+82[\s()-]*10(?:[\s()-]*\d){8}$/.test(raw.trim())) {
    return formatPhone(dial, '0' + digits.slice(2));
  }
  if (dial === '82' && digits.length > 11) return digits;
  return formatPhone(dial, digits);
}
