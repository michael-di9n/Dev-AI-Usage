/**
 * Stands in for the `claude` binary so the spawn path is tested for real without
 * a Claude Code install, a login, or a network. CI has none of the three.
 *
 * Run as `node fake-claude.mjs --scenario <name> <the real argv...>`, which is
 * why CliInvoker has a `commandPrefix`: it means this file needs no executable
 * bit in git and no shebang portability question.
 */
const argv = process.argv.slice(2);
const scenario = argv[argv.indexOf("--scenario") + 1] ?? "ok";

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  const envelope = {
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "fixture",
    total_cost_usd: 0,
    permission_denials: [],
    // Echoed so a test can prove the prompt travelled on stdin, not in argv.
    result: `stdin:${stdin}`,
  };

  switch (scenario) {
    case "error":
      // The shape that matters: a failed run still says subtype "success", and
      // the only honest signal is is_error.
      process.stdout.write(JSON.stringify({
        ...envelope, is_error: true, result: "Model not found: nope",
      }));
      process.exit(1);
      break;

    case "denied":
      process.stdout.write(JSON.stringify({
        ...envelope, permission_denials: [{ tool_name: "Read" }], result: "",
      }));
      process.exit(0);
      break;

    case "exit1":
      process.stderr.write("something broke in the harness\n");
      process.exit(1);
      break;

    case "garbage":
      process.stdout.write("not json at all");
      process.exit(0);
      break;

    case "slow":
      setTimeout(() => {
        process.stdout.write(JSON.stringify(envelope));
        process.exit(0);
      }, 30_000);
      break;

    default:
      process.stdout.write(JSON.stringify(envelope));
      process.exit(0);
  }
});
