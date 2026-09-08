"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_APPEARANCE, MODES, STORAGE_KEY,
  attributesFor, nextMode, parseAppearance, type Appearance,
} from "./themes";

/**
 * One button that steps through system, light and dark.
 *
 * Sits in the top bar of every page because switching to dark is a thing
 * people do idly, at the moment the room gets darker, and making them go to a
 * settings page first means they do it once and never again. Full control
 * still lives on Setup.
 */
export function ThemeCycler() {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    try {
      setAppearance(parseAppearance(localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Private windows throw on access; the default is a fine answer.
    }
  }, []);

  const current = MODES.find((m) => m.id === appearance.mode) ?? MODES[0]!;
  const upcoming = MODES.find((m) => m.id === nextMode(appearance.mode)) ?? MODES[0]!;

  const step = () => {
    const next: Appearance = { mode: nextMode(appearance.mode) };
    setAppearance(next);

    const { mode } = attributesFor(next);
    const root = document.documentElement;
    if (mode) root.setAttribute("data-mode", mode);
    else root.removeAttribute("data-mode");

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not persisting is a smaller failure than not switching.
    }
  };

  return (
    <button type="button" className="cycler" onClick={step} title={`Switch to ${upcoming.label}`}>
      <span className="swatch-dot" aria-hidden="true" />
      {current.label}
      <span className="cycler-hint" aria-hidden="true">&rarr; {upcoming.label}</span>
    </button>
  );
}
