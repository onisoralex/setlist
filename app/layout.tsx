import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";
import { prisma } from "@/lib/prisma";
import { isValidCssLength, isValidHexColor } from "@/lib/settings";
import MuiThemeProvider from "@/components/MuiThemeProvider";
import HeaderTitleProvider from "@/components/HeaderTitleProvider";
import HeaderTitle from "@/components/HeaderTitle";

export const metadata: Metadata = {
  title: "setlist",
  description: "Song repertoire and setlist management",
};

// The layout reads live settings from the DB on every request to inject the theme override
// <style> tag -- it must never be statically prerendered (that would bake in whatever
// settings existed at build time and never reflect later changes), which is also what was
// breaking the build: Next tries to prerender the auto-generated /_not-found page through
// this layout at build time, before a DB connection is guaranteed to be available.
export const dynamic = "force-dynamic";

const SETTINGS_ID = true;

// Emits a `--btn-*` override line only when the DB value is both non-null and still valid --
// defensive re-validation against a bad row (manual DB edit, future bug elsewhere) since this
// string gets interpolated directly into a <style> tag rather than passed through a
// React-escaped attribute.
const buttonColorLine = (cssVar: string, value: string | null) =>
  value !== null && isValidHexColor(value) ? `${cssVar}: ${value};` : "";

const RootLayout = async ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const settings = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });

  // Font sizes (and the spacer-height field, which shares the same CSS-length validation) are
  // required fields, but still guarded here rather than trusted blindly -- same defensive
  // stance as the color fields below.
  const fontSizeLine = (cssVar: string, value: string) =>
    isValidCssLength(value) ? `${cssVar}: ${value};` : "";

  const overrideStyle = `
    :root {
      ${fontSizeLine("--font-size-sm", settings.fontSizeSm)}
      ${fontSizeLine("--font-size-md", settings.fontSizeMd)}
      ${fontSizeLine("--font-size-lg", settings.fontSizeLg)}
      ${fontSizeLine("--font-size-xl", settings.fontSizeXl)}
      ${fontSizeLine("--font-size-heading", settings.fontSizeHeading)}
      ${fontSizeLine("--font-size-nav-brand", settings.fontSizeNavBrand)}
      ${fontSizeLine("--font-size-nav-link", settings.fontSizeNavLink)}
      ${fontSizeLine("--spacer-height", settings.spacerHeight)}
      ${buttonColorLine("--btn-primary-background", settings.btnPrimaryBackground)}
      ${buttonColorLine("--btn-primary-color", settings.btnPrimaryColor)}
      ${buttonColorLine("--btn-secondary-background", settings.btnSecondaryBackground)}
      ${buttonColorLine("--btn-secondary-color", settings.btnSecondaryColor)}
      ${buttonColorLine("--btn-danger-background", settings.btnDangerBackground)}
      ${buttonColorLine("--btn-danger-color", settings.btnDangerColor)}
      ${buttonColorLine("--page-background", settings.backgroundColor)}
    }
  `;

  return (
    <html lang="de">
      <head>
        <style>{overrideStyle}</style>
      </head>
      <body>
        <MuiThemeProvider>
          <HeaderTitleProvider>
            <nav className={styles.nav}>
              <HeaderTitle />
              <div className={styles.links}>
                <Link href="/songs">Songs</Link>
                <Link href="/events">Events</Link>
                <Link href="/settings">Settings</Link>
              </div>
            </nav>
            <main className={styles.main}>{children}</main>
          </HeaderTitleProvider>
        </MuiThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
