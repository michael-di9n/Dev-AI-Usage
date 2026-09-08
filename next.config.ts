import type { NextConfig } from "next";

const config: NextConfig = {
  // node:sqlite and node:fs must stay external: bundling them breaks the driver
  // and would pull the whole transcript corpus into Turbopack's trace.
  serverExternalPackages: ["node:sqlite"],

  /*
   * Hooks, Telemetry and Trace moved under /observability when the analyzer
   * joined them. These three keep the old addresses working.
   *
   * `permanent: false` deliberately. A 308 is cached by the browser
   * indefinitely and cannot be taken back without clearing site data, which is
   * a bad trade for a localhost tool whose routes might move again - and the
   * only thing these serve is a bookmark or a link in an older doc.
   */
  async redirects() {
    return ["hooks", "telemetry", "trace"].map((page) => ({
      source: `/${page}`,
      destination: `/observability/${page}`,
      permanent: false,
    }));
  },
};

export default config;
