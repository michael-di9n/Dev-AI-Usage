"use client";

import { useEffect } from "react";

/**
 * Remembers the slice you were last looking at, so `/` comes back to it.
 *
 * A cookie rather than `localStorage`, because the page that has to act on it
 * is rendered on the server: storage would mean rendering the default first
 * and then correcting it, which is a visible flash of the wrong month and a
 * second render of every query behind it.
 *
 * Written from the client rather than by the server, for one reason worth
 * stating: a server that set this would have to do it on a request that only
 * meant to read, and Next does not allow `cookies().set` during a render
 * anyway. Doing it here also keeps the whole feature off the no-JavaScript
 * path - without scripting the dashboard behaves exactly as it did before,
 * links and all, rather than half-working.
 *
 * `SameSite=Lax` and no `Secure`: this is a localhost tool and the value is a
 * word like "month". It is not `HttpOnly` precisely because this script is the
 * thing that writes it.
 */

/** A year. Long enough that it survives a holiday, short enough that a machine
 *  you stop using forgets. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function RememberSlice({ name, period, granularity }: {
  name: string;
  period: string;
  granularity: string;
}) {
  useEffect(() => {
    const value = `${period}.${granularity}`;
    try {
      document.cookie =
        `${name}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR_SECONDS};SameSite=Lax`;
    } catch {
      // Cookies can be refused outright - a hardened profile, a private
      // window. The page has already rendered correctly without this, so
      // there is nothing to fall back to and nothing to report: the slice
      // simply does not persist, which is where this feature started.
    }
  }, [name, period, granularity]);

  return null;
}
