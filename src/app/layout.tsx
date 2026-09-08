import type { ReactNode } from "react";
import { Nav } from "../components/Nav";
import { STORAGE_KEY } from "../components/themes";
import "./globals.css";

/**
 * Runs before the first paint, so a pinned mode is already applied when the
 * page appears. Kept to one expression and wrapped in try/catch because
 * localStorage throws outright in a private window.
 */
const APPLY_SAVED_MODE = `try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}");if(a.mode&&a.mode!=="system")document.documentElement.setAttribute("data-mode",a.mode)}catch(e){}`;

export const metadata = {
  title: "Dev AI Usage",
  description: "Where your AI tokens and time actually go.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_MODE }} />
      </head>
      <body>
        <div className="shell">
          <Nav />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
