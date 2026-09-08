/**
 * The key the Observability pages store a nominated user-settings file under,
 * and nothing else.
 *
 * Its own module because of who needs it. `observability.ts` reads it and
 * drags in the scanner and the database; `user-settings-actions.ts` writes it
 * and is a `"use server"` module; and `UserSettingsPicker` is a client
 * component that imports the action. With the constant living beside the view
 * helpers, that chain would put `node:fs` and the sqlite driver on the path to
 * the browser bundle. One constant with no imports of its own cannot do that
 * to anyone.
 *
 * This is the same argument as `repo-key.ts` and `trace-key.ts`, written out
 * again rather than cross-referenced, because the file it protects is the one
 * someone tidying up would inline.
 */
export const USER_SETTINGS_PATH = "observability.userSettingsPath";
