"use server";

import { revalidatePath } from "next/cache";
import { formatTapKinds, parseTapKinds } from "../domain/traceTap";
import { app } from "./dashboard";
import { TAP_KINDS_KEY } from "./tap-key";

/**
 * The one write the trace-tap window makes: which streams it reads.
 *
 * A selection, so it is remembered - AGENTS.md's rule - and it is stored the
 * way every other stored choice here is, through `app_state`. The form posts
 * the whole list after the flip rather than the one switch flipped, so the
 * rule that the last stream cannot be switched off lives in `toggleTapKind`
 * where the button computes its value, and `parseTapKinds` here fails open on
 * anything that would have left the window reading nothing.
 *
 * Looking at the window writes nothing. Flipping a switch on it writes this.
 *
 * `revalidatePath` stays, and it is worth saying why now that the window
 * narrows its own log: nothing the server renders depends on the switches any
 * more, so this looks like a line that could go. It cannot. `useOptimistic`
 * drops its overlay the moment this transition resolves and falls back to the
 * prop it was seeded from - without a revalidation that prop is still the
 * pre-click value, and the switches would visibly snap back. Keeping it is
 * what makes the server render the authority, which is the rule.
 */
export async function setTapKinds(formData: FormData): Promise<void> {
  const raw = formData.get("kinds");
  if (typeof raw !== "string") return;

  app().writes.setState(TAP_KINDS_KEY, formatTapKinds(parseTapKinds(raw)));
  revalidatePath("/observability");
}
