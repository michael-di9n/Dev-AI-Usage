import type { UserSettingsLocation } from "../domain/instrumentation";
import { setUserSettingsPath } from "../app/user-settings-actions";

/**
 * Which user-scope settings file answered, and how to change it.
 *
 * One control and one explanation for one question. There used to be two: an
 * alert at the top of the page saying `~/.claude/settings.json` is never read,
 * and this box further down offering somewhere to type a path - and they never
 * appeared together, because this one hid itself whenever a file had been
 * found. So a reader who hit the shadowing trap was told their settings file
 * was being ignored and given nothing to do about it, which is the one case
 * where naming another file is exactly the fix.
 *
 * Renders nothing when the usual place answered, nothing is shadowed, and the
 * reader has not overridden it - which is the ordinary case. A permanently
 * visible control for a question that is already answered is a control that
 * teaches the reader to scroll past this whole area, the same argument
 * `HygieneList` makes for hiding an empty problems list.
 *
 * The alternatives it offers are files that exist on this machine, never a
 * search path. User scope has one documented home, `~/.claude/settings.json`,
 * moved wholesale by `CLAUDE_CONFIG_DIR`; offering a list of plausible-looking
 * locations would be inventing places Claude Code has never read. The shadowed
 * file is offered because it is real and because the reader may well have been
 * editing it.
 *
 * A path typed in, rather than a file chooser. A browser file input hands over
 * the file's contents and deliberately not its path, so a chooser here could
 * not tell the server which file to read on later loads - and this choice has
 * to survive the page, or it is not a setting.
 */
export function UserSettingsPicker({
  location,
  shadowed,
}: {
  location: UserSettingsLocation;
  /**
   * A user-level file that exists and is not the one being read. Only ever set
   * when `CLAUDE_CONFIG_DIR` moved user scope somewhere else - see
   * `SettingsScanner.ignoredUserFile`.
   */
  shadowed: string | null;
}) {
  const nominated = location.source === "nominated";
  const missing = !location.exists;
  if (!missing && !nominated && !shadowed) return null;

  return (
    <div className={missing ? "panel panel-pad alert" : "panel panel-pad"}>
      <strong>
        {missing
          ? "No user settings file to read."
          : nominated
            ? "Reading user settings from a file you chose."
            : "currently read user (global) settings.json"}
      </strong>

      {/*
        The heading alone answers the shadowed case: it names the file being
        read and that is the whole question. The paragraph is for the cases
        where a name is not enough - a file that could not be parsed, one that
        is not there, or one the reader nominated over the default.
      */}
      {location.problem || missing || nominated ? (
        <p className="note" style={{ marginTop: 6 }}>
          {location.problem ? (
            location.problem
          ) : missing ? (
            <>
              Looked in <code>{location.path}</code>
              {location.source === "config-dir" ? (
                <>, because <code>CLAUDE_CONFIG_DIR</code> points there</>
              ) : (
                <>, which is where it normally lives</>
              )}
              . Nothing is there, so only this project&apos;s own settings are being
              read.
            </>
          ) : (
            <>
              <code>{location.path}</code> is being read as user scope instead of{" "}
              <code>{location.fallback}</code>.
            </>
          )}
        </p>
      ) : null}

      {missing ? (
        <p className="note" style={{ marginTop: 6 }}>
          The usual location is <code>{location.fallback}</code>, and{" "}
          <code>CLAUDE_CONFIG_DIR</code> moves it. This server only sees that variable
          if it was exported before <code>npm run dev</code> started, so a terminal
          Claude Code is happy in can still look empty from here. If you keep yours
          somewhere else, name the file and it will be remembered.
        </p>
      ) : null}

      <form action={setUserSettingsPath} className="picker-form">
        <label htmlFor="user-settings-path">
          {missing ? "Path to your settings.json" : "Read a different file"}
        </label>
        <div className="picker-row">
          <input
            id="user-settings-path"
            name="path"
            type="text"
            defaultValue={nominated ? location.path : ""}
            placeholder={location.fallback}
            spellCheck={false}
          />
          <button type="submit" className="btn primary">Use this file</button>
        </div>
      </form>

      {/*
        The files that are actually here, as one click each. Typing a path
        correctly is the step this control can fail at, and both of these are
        paths the scan has already resolved.
      */}
      {/* A div, not a p: each of these is a form, and a form inside a
          paragraph is a hydration error rather than a style question. */}
      <div className="picker-alts">
        {shadowed && !nominated ? (
          <SwitchTo path={shadowed} label={`Read ${shadowed} instead`} />
        ) : null}
        {nominated ? (
          <SwitchTo path="" label={`Go back to ${location.fallback}`} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * One stored choice, set or cleared.
 *
 * Submitting the same action with nothing in it clears it, so "set" and
 * "reset" stay one value in `app_state` rather than two that can disagree.
 */
function SwitchTo({ path, label }: { path: string; label: string }) {
  return (
    <form action={setUserSettingsPath}>
      <input type="hidden" name="path" value={path} />
      <button type="submit" className="btn">{label}</button>
    </form>
  );
}
