import type { Signal } from "../domain/types";

/**
 * One rule, one class.
 *
 * Adding a rule means adding a class and listing it in that rule family's
 * registry - nothing existing changes. That is the whole reason a detector
 * takes a loaded context and returns signals instead of writing to the
 * database itself.
 *
 * Generic in its context because the contexts differ by family and always
 * will: a project-maturity rule reads a filesystem scan, a usage rule reads
 * transcript facts. What every rule owes the reader is the same three things -
 * a `kind`, an `explanation`, and signals that carry their own evidence - and
 * that is what this interface pins.
 */
export interface Detector<TContext> {
  readonly kind: string;
  /** One sentence the UI shows beside the finding, so a number always has a why. */
  readonly explanation: string;
  detect(ctx: TContext): Signal[];
}
