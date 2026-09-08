/**
 * The key both scanning pages store their chosen repository under, and nothing
 * else.
 *
 * Its own module because of who needs it. `readiness.ts` and `observability.ts`
 * read it and drag in the filesystem, the scanners and the database;
 * `repo-actions.ts` writes it and is a `"use server"` module; and `RepoPicker`
 * is a client component that imports the action. With the constant living
 * beside the view helpers, that chain put `RepoScanner` and the database driver
 * on the path to the browser bundle - which is how a `node:fs` import ends up
 * being evaluated in Chrome. One constant with no imports of its own cannot do
 * that to anyone.
 *
 * One key, not two. AI maturity and Observability both answer a question about
 * a repository, and two selections would let the rail hold two pages naming
 * different projects while both said "this one". The value keeps its original
 * spelling so selections stored before the file was renamed still resolve.
 */
export const SELECTED_REPO = "readiness.selectedRepo";
