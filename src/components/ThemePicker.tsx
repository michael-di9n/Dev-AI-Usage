"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_APPEARANCE, MODES, STORAGE_KEY,
  attributesFor, parseAppearance, type Appearance, type Mode,
} from "./themes";

/**
 * Pin light or dark, or follow the system.
 *
 * The choice is per-browser and stays in localStorage - it is a viewer
 * preference, not data, so it never reaches the server or the database.
 *
 * Reads on mount rather than during render: the server has no localStorage, so
 * anything else is a hydration mismatch. The inline script in the layout has
 * already applied the saved attribute by then, which is what stops the flash.
 */
export function ThemePicker() {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    try {
      setAppearance(parseAppearance(localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Private windows and blocked site data both throw; the default is fine.
    }
  }, []);

  const apply = (next: Appearance) => {
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
    <div className="picker">
      <div className="picker-row" role="group" aria-label="Light or dark">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={mode.id === appearance.mode ? "swatch on" : "swatch"}
            aria-pressed={mode.id === appearance.mode}
            onClick={() => apply({ mode: mode.id as Mode })}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <p className="picker-note">
        One palette, Tide, measured to clear AA in both. Saved in this browser only.
      </p>
    </div>
  );
}
