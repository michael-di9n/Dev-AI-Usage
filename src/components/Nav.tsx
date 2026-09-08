"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**No account, no upload.
 * Icon plus label, not icon alone.
 *
 * The reference design uses a bare icon rail, which works when you are in the
 * app every day. This is a tool you open weekly, so an unlabelled pictogram
 * costs a guess every time. The labels also keep the rail's contrast
 * measurable, which an icon would not be.
 */
interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
}

/**
 * One flat rail, no groups.
 *
 * Hooks, Telemetry and Trace used to sit indented under an "Observability"
 * heading, because all three were views of one thing and each discovered
 * independently that the reader had not switched it on. Two of those pages are
 * gone: everything they said about what to turn on is now on this page
 * itself, on the node that owns the setting. A group heading over the two tabs
 * that remain would be a level of hierarchy earning nothing, and an indent is
 * a promise of siblings.
 *
 * "Observability" rather than "Readiness", because it is the only page under
 * that word now and the group heading it used to sit beneath is gone. A tab
 * named for a property of the answer - how ready you are - reads as a score to
 * go and look at. Named for the subject, it reads as where the subject lives,
 * which is what a rail is for.
 */
const TABS: Tab[] = [
  { href: "/", label: "Trends", icon: <TrendIcon /> },
  { href: "/static", label: "AI maturity", icon: <ScanIcon /> },
  { href: "/observability", label: "Observability", icon: <GaugeIcon /> },
  { href: "/observability/trace", label: "Trace", icon: <TraceIcon /> },
  { href: "/setup", label: "Setup", icon: <SetupIcon /> },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="rail">
      <div className="rail-brand">
        Dev AI Usage
        <span></span>
      </div>

      <nav className="rail-nav" aria-label="Sections">
        {TABS.map((tab) => {
          /*
           * Exact match, not a prefix. `/observability` is a prefix of
           * `/observability/trace`, so a startsWith test would light both at
           * once and the rail would stop saying which page you are on.
           */
          const active = pathname === tab.href;

          return (
            /*
              `Link`, not a bare anchor. Every tab used to be a full document
              navigation: a fresh HTML request, the whole server render, and
              the JavaScript parsed again from scratch, with no router cache
              to reuse any of it. This keeps the transition on the client and
              lets Next start on the next page while the pointer is still on
              the way to it - which matters most on Trace, the page with the
              most to do before it can answer. Everything it asks for is this
              app's own routes on this machine; nothing leaves it.
            */
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? "on" : undefined}
              // Colour and weight both change, but neither is enough on its own.
              aria-current={active ? "page" : undefined}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="rail-foot"> Not a production tool</div>
    </aside>
  );
}

/* Inline SVG rather than an icon package: a couple of glyphs is not worth a
   dependency, and `currentColor` makes them follow the active state for free. */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function TrendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 14.5 L7 8.5 L11 11.5 L17.5 4" {...STROKE} />
      <path d="M13 4h4.5v4.5" {...STROKE} />
    </svg>
  );
}

function SetupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="2.6" {...STROKE} />
      <path d="M10 1.8v2.3M10 15.9v2.3M2.6 10H4.9M15.1 10h2.3M4.8 4.8l1.6 1.6M13.6 13.6l1.6 1.6M15.2 4.8l-1.6 1.6M6.4 13.6l-1.6 1.6" {...STROKE} />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none"
         stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5V3a1 1 0 0 1 1-1h2M14 5V3a1 1 0 0 0-1-1h-2M2 11v2a1 1 0 0 0 1 1h2M14 11v2a1 1 0 0 1-1 1h-2" />
      <path d="M4.5 8h7" />
    </svg>
  );
}

/* A telemetry trace: a flat line with one spike, the shape of a request. */

/** A branching run: one spine, two steps off it. */
function TraceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 3v13" {...STROKE} />
      <path d="M5 7.5h6" {...STROKE} />
      <path d="M5 13.5h6" {...STROKE} />
      <circle cx="13.5" cy="7.5" r="2" {...STROKE} />
      <circle cx="13.5" cy="13.5" r="2" {...STROKE} />
    </svg>
  );
}

/**
 * A dial with its needle part way round: how much of the instrumentation is
 * switched on. Not the scan glyph, which AI maturity already has - two rail
 * entries drawn the same are two entries a reader has to read the label of.
 */
function GaugeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 14a7.5 7.5 0 1 1 14 0" {...STROKE} />
      <path d="M10 13.5 13.2 8.3" {...STROKE} />
    </svg>
  );
}

/* A hook. Literally. */

