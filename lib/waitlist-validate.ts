// Validation for public waitlist sign-ups. Deliberately lenient: it only rejects
// input that can't be a real person's contact details.
//
// Calibrated against every existing booking (876 paying customers) and waitlist
// entry (371) on 2026-10-01: the rules reject all 8 known junk entries and none
// of the real ones. A stricter UK-length phone rule was tried and dropped — it
// would have blocked real customers with overseas numbers typed without "+".

// Characters people paste in from their phone's contacts (direction marks,
// zero-width spaces, non-breaking spaces) that are invisible but break checks.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿ ]/g

// name@domain.tld, any letters for the TLD (.com, .co.uk, .london, IDNs).
// Anything else can't receive our emails anyway.
const EMAIL = /^[^\s@]+@[^\s@]+\.\p{L}{2,}$/u

export type ValidationResult =
  | { ok: true; name: string; email: string; phone: string }
  | { ok: false; field: 'name' | 'email' | 'phone'; error: string }

export function validateWaitlistInput(input: { name?: unknown; email?: unknown; phone?: unknown }): ValidationResult {
  const name = String(input.name ?? '').replace(INVISIBLE, ' ').trim().replace(/\s+/g, ' ')
  const email = String(input.email ?? '').replace(INVISIBLE, '').trim()
  const phone = String(input.phone ?? '').replace(INVISIBLE, '').trim()
  const phoneDigits = phone.replace(/\D/g, '').length

  if (!name || !/\p{L}/u.test(name) || name.length > 100)
    return { ok: false, field: 'name', error: 'Please enter your name.' }
  if (!EMAIL.test(email) || email.length > 254)
    return { ok: false, field: 'email', error: "That email address doesn't look right. Please check it and try again." }
  // Any format (spaces, +44, brackets, overseas). Only needs enough digits to be a number.
  if (phoneDigits < 7 || phoneDigits > 16)
    return { ok: false, field: 'phone', error: "That phone number doesn't look right. Please check it and try again." }

  return { ok: true, name, email, phone }
}
