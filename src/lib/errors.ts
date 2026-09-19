// What gets logged about an error: its kind and message, never the object,
// which for a validation error can carry the content that failed.
export function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}
