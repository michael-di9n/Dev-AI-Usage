"use server";

import { revalidatePath } from "next/cache";
import { app } from "./dashboard";
import { SELECTED_REPO } from "./repo-key";

/**
 * The one write these pages make. Split from readiness.ts because a "use
 * server" module may export only async functions, and the view helpers there
 * export a constant and two types.
 *
 * There is no `clearRepo` any more. Clearing the choice was only ever the way
 * back to the picker, and the picker is now always on the page - so the button
 * that threw the selection away existed to undo the fact that it was hidden.
 *
 * Both readers are revalidated, not just the one the picker was on. They share
 * a selection, so a stale render of the other would show the previous
 * project's scan under the new project's name.
 */

export async function selectRepo(formData: FormData): Promise<void> {
  const raw = formData.get("path");
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path) return;

  app().writes.setState(SELECTED_REPO, path);
  revalidatePath("/static");
  revalidatePath("/observability");
}
