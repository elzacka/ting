// What this device calls the way a passkey unlocks the app, for the switch, the lock screen
// button and their messages. Read when asked, not at load, so the dev frame's user agent counts.
export function unlockMethod(): string {
  const ua = navigator.userAgent
  // An iPad reports itself as a Mac
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return 'Face ID eller Touch ID'
  if (/Windows/.test(ua)) return 'Windows Hello'
  // Android and the rest: the passkey asks for whatever unlocks the screen
  return 'skjermlåsen'
}
