/** Anything shaped like a credential. Matched on value, because a leaked key
 *  rarely arrives next to a helpfully-named variable. */
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|aak|ghp|gho|ghs|glpat|xox[baprs])[-_][A-Za-z0-9_-]{10,}/g,
  /\b[A-Z][A-Z0-9_]{6,}(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?\s*[=:]\s*\S+/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b[A-Fa-f0-9]{40,}\b/g,
];

const HOME_PATH = /\/(?:home|Users)\/[^\s"',:]+/g;
const ABSOLUTE_PATH = /(?:\/[\w.@+-]+){3,}\/?/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;

/**
 * Everything that leaves the machine passes through here first.
 *
 * Prompts and commands carry client names, internal hostnames and, in practice,
 * live credentials pasted into a shell. The LLM layer is optional and its value
 * is naming clusters - none of that value needs the secret, so nothing that
 * looks like one is ever sent.
 */
export class Redactor {
  redact(text: string): string {
    let out = text;
    // Secrets first: a later path rule must not shorten a key into something
    // that no longer matches the key pattern.
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "<redacted>");
    return out
      .replace(EMAIL, "<email>")
      .replace(HOME_PATH, "<home>")
      .replace(ABSOLUTE_PATH, "<path>")
      .trim();
  }

  /** Cluster representatives only; a full command is never needed to name one. */
  redactSample(text: string, maxLength = 200): string {
    const redacted = this.redact(text);
    return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}...`;
  }
}
