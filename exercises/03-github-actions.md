# Exercise 03 — Run Claude in CI

**Time:** ~10 minutes. **Unlocks:** house rules checked on every pull request, @claude on issues, a reviewer that reads the rules from the file, and the CI/CD cell on the AI maturity page.

Most of this is GitHub. [GitLab is at the end](#gitlab-there-is-no-action-run-it-headless), and it is
shorter, because there is no action to install.

`AGENTS.md` holds five rules that decide whether a change belongs in this repo.
They are enforced by review, and review is where they get forgotten. This
exercise puts them in a workflow, so they are applied from the file rather than
from memory. It is the only exercise here that writes inside the repo.

## This one needs a git remote

```bash
git rev-parse --show-toplevel   # a path, or "not a git repository"
git remote -v                    # expect a github.com url
```

A fresh copy of this project is neither a git repository nor connected to one. If
either command fails there is nothing for a workflow to attach to. Run
`git init`, push to a GitHub repository, then come back.

## Step 1: give the repository a credential

Fastest, from a Claude Code session in this checkout:

```
/install-github-app
```

That installs the GitHub app, stores the secret, and opens a pull request with a
starter workflow. To do it by hand instead, install the app from
`github.com/apps/claude`, then:

```bash
claude setup-token                       # prints a long-lived token
gh secret set CLAUDE_CODE_OAUTH_TOKEN    # paste it at the prompt
```

| Secret | Action input | When to use it |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude_code_oauth_token` | You pay for a Claude subscription. This is what the shipped workflows expect. |
| `ANTHROPIC_API_KEY` | `anthropic_api_key` | You have a console key and would rather the usage was billed there. Swap the input name in both files. |

`claude setup-token` needs a subscription. It works on Pro, Max, Team and
Enterprise, and it is why this costs nothing beyond what you already pay.

## Step 2: read the two workflows before you enable them

Both already exist in `.github/workflows/`, beside `ci.yml`, which they do not
touch. Read them now, because they run with write access to your repository.

Each job reads the secret into an environment variable and skips its own step
when that variable is empty. `secrets` is not available in a job-level `if`, so
the guard has to sit on the step instead. A clone with no secret therefore shows
a green skipped job rather than a wall of authentication failures.

The mode is not a setting. The action infers it from whether you supplied a
`prompt`.

| `prompt` input | Mode | Behaviour |
|---|---|---|
| absent | interactive | Waits until someone writes `@claude` in a comment, a review, or an issue. This is `claude.yml`. |
| present | automation | Runs on the event itself, with no mention needed, and posts what it found. This is `house-rules.yml`. |
| both files deleted | off | Nothing changes about the merge gate. `ci.yml` still runs typecheck, tests, build and the fresh-install UI checks. |

## Step 3: verify

```bash
gh workflow list    # expect Claude and House rules, both active
gh secret list      # expect CLAUDE_CODE_OAUTH_TOKEN
```

Then open a pull request and comment `@claude which rule in AGENTS.md does this
change touch?`. A run appears in the Actions tab within seconds, and a reply
follows a minute or two later. The house-rules review posts on its own, with no
mention needed.

## What you get

| Thing | Why it is not derivable otherwise |
|---|---|
| The house-rules review | The five rules in `AGENTS.md` are prose. A person applies them from memory and forgets one. This applies them from the file, against every diff, in the same order every time. |
| `CLAUDE_CODE_OAUTH_TOKEN` | The only way to run this on a subscription. An `ANTHROPIC_API_KEY` bills separately and is a second credential to rotate. |
| `id-token: write` | The action mints its own GitHub App token from this. Leave the line out and every run fails at authentication, with an error naming none of it. |
| `actions: read` | Lets the review read the `ci.yml` run beside it. Without it, a failing test is invisible to the reviewer commenting on the same pull request. |

## GitLab: there is no action, run it headless

GitLab has no equivalent of `claude-code-action`. You install the CLI in the
job and run it in **headless mode** — `claude -p`, which takes the prompt as an
argument, prints the result and exits. That is the whole integration.

```yaml
claude:
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  before_script:
    - apk add --no-cache git curl bash
    - curl -fsSL https://claude.ai/install.sh | bash
    # The installer puts claude in ~/.local/bin, which is not on PATH here.
    - export PATH="$HOME/.local/bin:$PATH"
  script:
    - >
      claude --bare
      -p "Review this MR against AGENTS.md and report which rule it touches."
      --permission-mode acceptEdits
      --max-turns 10
```

Add `ANTHROPIC_API_KEY` as a masked CI/CD variable under **Settings → CI/CD →
Variables**. `CLAUDE_CODE_OAUTH_TOKEN` is a GitHub-only path; GitLab wants the
API key.

Four flags are worth knowing, and they are the same four anywhere you script
Claude:

| Flag | What it does |
|---|---|
| `-p` | Headless. Run this prompt, print the answer, exit. `--print` is the long form. |
| `--bare` | Skip the host's hooks, plugins, MCP servers and `CLAUDE.md`. Recommended in CI, because it makes the run the same on every machine. |
| `--permission-mode` | The baseline for what Claude may do unasked. `acceptEdits` lets it write files. |
| `--max-turns` | The cost ceiling. A run that cannot finish stops rather than looping. |

The same shape works outside CI. `git diff main | claude -p "list the typos"`
in a `package.json` script is the same integration with a smaller prompt.

## What the CI/CD cell counts

The **CI/CD** cell on the AI maturity page counts pipelines that run Claude —
not pipelines. Every repository with a test job has `.github/workflows/`, and
that is not the measurement.

It reads `.gitlab-ci.yml`, `.gitlab/ci/*.yml` and `.github/workflows/*.yml`,
and a file counts when its text matches one of three forms:

| Form | Matched by | Where it comes from |
|---|---|---|
| GitHub Action | `anthropics/claude-code-action`, or the older `-base-action` | Step 2 above |
| headless CLI | `claude` followed by `-p` or `--print` | The GitLab job above |
| CLI installed in the job | `@anthropic-ai/claude-code`, or `claude.ai/install.sh` | The `before_script` above |

Each row is a grep, so the count is checkable by hand. The cell names the forms
it found, so a merged pipeline and a GitLab job do not read as the same
sentence.

In this repository it reads `2 of 3 pipelines run Claude - GitHub Action`.
`ci.yml` is the third, and it is deliberately not one of them.

## Notes

- The trigger must come from an account with write access. Bot actors are
  rejected unless you name them in `allowed_bots`, and that is the security model.
- On a public repository GitHub withholds secrets from fork pull requests, so the
  review only runs on branches pushed to this repo. That is deliberate.
- It does not backfill. Only pull requests opened or pushed after you merge this
  are reviewed, so an existing one needs a new commit to wake it up.
- To turn it off, delete the two files. `ci.yml` is untouched and keeps gating the
  merge on typecheck, tests, build and the UI checks.
