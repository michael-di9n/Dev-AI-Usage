import { describe, expect, it } from "vitest";
import { Normalizer } from "../src/domain/Normalizer";
import { Redactor } from "../src/analyze/Redactor";

/**
 * The two pure rules that outlived the waste detectors.
 *
 * `Normalizer` still defines "the same work" for anything that has to compare
 * commands or prompts across sessions. `Redactor` is the egress gate: every
 * string that leaves this machine passes through it first, so its cases are
 * written as the leaks they prevent rather than as regex exercises.
 */

const normalizer = new Normalizer();

describe("Normalizer", () => {
  it("collapses the same command under a different cwd and tail count", () => {
    const a = normalizer.normalizeCommand('cd "/media/x/proj" && npm run typecheck 2>&1 | tail -20');
    const b = normalizer.normalizeCommand('cd "/home/y/other" && npm run typecheck 2>&1 | tail -30');
    expect(a).toBe(b);
  });

  it("keeps genuinely different commands apart", () => {
    expect(normalizer.normalizeCommand("npm run build")).not.toBe(
      normalizer.normalizeCommand("npm run test"),
    );
  });

  it("normalises a polling timestamp out of a repeated curl", () => {
    const a = normalizer.normalizeCommand("curl -s 'http://localhost:4000/notifications?since=1785723357261'");
    const b = normalizer.normalizeCommand("curl -s 'http://localhost:4000/notifications?since=1785999999999'");
    expect(a).toBe(b);
  });

  it("leaves a single digit in a tool name alone", () => {
    expect(normalizer.normalizeCommand("python3 script.py")).toContain("python3");
  });
});

describe("Redactor", () => {
  const redactor = new Redactor();

  it("strips a credential-shaped value", () => {
    const out = redactor.redact('export EXAMPLE_SERVICE_API_KEY=aak_EXAMPLEKEY0000000000000000000');
    expect(out).not.toContain("aak_EXAMPLEKEY0000000000000000000");
    expect(out).toContain("<redacted>");
  });

  it("strips an api key even without a named variable", () => {
    expect(redactor.redact("sk-ant-admin01-abcdefghijklmnop")).toContain("<redacted>");
  });

  it("replaces home and absolute paths", () => {
    const out = redactor.redact("/home/devuser/Projects/acme-client/app.ts");
    expect(out).not.toContain("devuser");
    expect(out).not.toContain("acme-client");
  });

  it("replaces email addresses", () => {
    expect(redactor.redact("ping dev@example.com")).toBe("ping <email>");
  });

  it("truncates a sample to keep payloads small", () => {
    expect(redactor.redactSample("a".repeat(500)).length).toBeLessThanOrEqual(203);
  });
});
