/**
 * The key the trace-tap window stores its stream switches under, and nothing
 * else.
 *
 * Its own module for the reason `repo-key.ts` is: `observability.ts` reads it
 * and drags in the database, `tap-actions.ts` writes it and is a `"use server"`
 * module, and `TraceMonitor` is a client component that imports the action.
 * A constant with no imports of its own is the one thing all three can share
 * without putting the driver on the path to the browser bundle.
 *
 * Under `observability.` rather than `trace.`, because the window it belongs
 * to is on the Observability page - the Trace page's keys are about runs.
 */
export const TAP_KINDS_KEY = "observability.tapKinds";
