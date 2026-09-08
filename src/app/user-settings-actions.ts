"use server";

import { revalidatePath } from "next/cache";
import { app } from "./dashboard";
import { USER_SETTINGS_PATH } from "./user-settings-key";

/**
 * Where this machine's user-scope settings file is, when the usual places are
 * empty.
 *
 * An empty submission clears the choice rather than storing a blank, so the
 * same control is both "set" and "reset" - a second button that only ever
 * writes `""` would be a second way to spell the same state.
 *
 * Observability is the only reader of this scan now, and it names the file
 * it read beside every verdict drawn from it - so a stale render would report
 * on the file that was in force before the reader changed it, which is
 * precisely the confusion this control exists to end.
 */
export async function setUserSettingsPath(formData: FormData): Promise<void> {
  const raw = formData.get("path");
  const path = typeof raw === "string" ? raw.trim() : "";

  app().writes.setState(USER_SETTINGS_PATH, path);
  revalidatePath("/observability");
}
