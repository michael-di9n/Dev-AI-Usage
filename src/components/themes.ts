/**
 * The viewer's appearance preference.
 *
 * There is one palette, Tide, declared once in globals.css. So the only choice
 * left is light, dark, or follow the system - which is a real choice, because
 * `light-dark()` follows the OS and a person on a light machine may still want
 * a dark dashboard.
 *
 * The preference lives in localStorage. It is a viewer preference, not data, so
 * it never reaches the server or the database.
 */

export type Mode = "system" | "light" | "dark";

export const MODES: { id: Mode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export const STORAGE_KEY = "dev-ai-usage:appearance";

export interface Appearance {
  mode: Mode;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: "system" };

export function isMode(id: unknown): id is Mode {
  return id === "system" || id === "light" || id === "dark";
}

/**
 * Tolerant of anything in storage: a bad value falls back, never throws.
 *
 * Deliberately ignores a `theme` key rather than rejecting the whole record.
 * Browsers that used the four-palette version still have one saved, and
 * discarding their light/dark choice over a field that no longer exists would
 * be a worse answer than dropping the field.
 */
export function parseAppearance(raw: string | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_APPEARANCE;
    const { mode } = parsed as { mode?: unknown };
    return { mode: isMode(mode) ? mode : "system" };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Applied to <html>. `system` means no attribute, so light-dark() follows the OS. */
export function attributesFor(appearance: Appearance): { mode: Mode | null } {
  return { mode: appearance.mode === "system" ? null : appearance.mode };
}

/** The next mode, so the top bar can be clicked through all three. */
export function nextMode(current: Mode): Mode {
  const index = MODES.findIndex((m) => m.id === current);
  return MODES[(index + 1) % MODES.length]!.id;
}
