// The code the app makes for a new register, in place of a passphrase the user must invent:
// 20 characters, 100 bits, from an alphabet without I, O, 0 and 1 so it can be read aloud and
// typed from paper. Groups of four; typed in any case, with or without the dashes.
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const length = 20

export function generateRecoveryCode(): string {
  // 32 characters and a byte & 31: every character is equally likely
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => alphabet[b & 31] ?? 'A')
  return (chars.join('').match(/.{4}/g) ?? []).join('-')
}

// What a typed code is read as: the characters of the alphabet, in capitals. Null when it is not
// a code, so a passphrase of the user's own is never altered.
export function normalizeCode(input: string): string | null {
  const bare = input.replace(/[\s-]/g, '').toUpperCase()
  return bare.length === length && [...bare].every((c) => alphabet.includes(c)) ? bare : null
}

// The secrets to try for what was typed: the code as stored first when it reads as one, then the
// text as typed. The code is stretched with its dashes, as shown.
export function secretsFor(input: string): string[] {
  const code = normalizeCode(input)
  if (!code) return [input]
  const shown = (code.match(/.{4}/g) ?? []).join('-')
  return shown === input ? [input] : [shown, input]
}
