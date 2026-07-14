"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import type { Settings } from "@/lib/types";
import styles from "./page.module.css";

const CSS_LENGTH_PATTERN = /^[0-9]+(\.[0-9]+)?(rem|px|em)$/;

const FONT_SIZE_FIELDS = [
  { key: "fontSizeSm", label: "Small text (buttons, meta text, labels)" },
  { key: "fontSizeMd", label: "Body text" },
  { key: "fontSizeLg", label: "Large text (song titles in lists)" },
  { key: "fontSizeXl", label: "Extra-large text" },
  { key: "fontSizeHeading", label: "Page titles" },
  { key: "fontSizeNavBrand", label: "Nav bar brand" },
  { key: "fontSizeNavLink", label: "Nav bar links" },
] as const;

type FontSizeField = (typeof FONT_SIZE_FIELDS)[number]["key"];

type ButtonColorGroup = {
  label: string;
  backgroundField: keyof Settings;
  colorField: keyof Settings;
  backgroundVar: string;
  colorVar: string;
};

const BUTTON_COLOR_GROUPS: ButtonColorGroup[] = [
  {
    label: "Primary",
    backgroundField: "btnPrimaryBackground",
    colorField: "btnPrimaryColor",
    backgroundVar: "--btn-primary-background",
    colorVar: "--btn-primary-color",
  },
  {
    label: "Secondary",
    backgroundField: "btnSecondaryBackground",
    colorField: "btnSecondaryColor",
    backgroundVar: "--btn-secondary-background",
    colorVar: "--btn-secondary-color",
  },
  {
    label: "Danger",
    backgroundField: "btnDangerBackground",
    colorField: "btnDangerColor",
    backgroundVar: "--btn-danger-background",
    colorVar: "--btn-danger-color",
  },
];

// getComputedStyle returns fully-resolved values (e.g. "rgb(37, 99, 235)"), not the hex the
// <input type="color"> element requires -- render through an offscreen canvas pixel to
// normalize any valid CSS color into "#rrggbb".
const resolvedColorToHex = (value: string): string => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const SettingsPage = () => {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  // Effective (resolved) colors for the "no override" case -- read from computed CSS on
  // mount, since that's the only way to know what color is currently showing when the DB
  // value is null.
  const [defaultColors, setDefaultColors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fontSizeErrors, setFontSizeErrors] = useState<Partial<Record<FontSizeField, string>>>({});

  // Only PATCH fields the user actually changed, mirroring the tracklist override editor's
  // "touched" tracking (app/events/[id]/edit/page.tsx) rather than resending everything.
  const touchedRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    apiFetch<Settings>("/api/settings")
      .then((result) => {
        setSettings(result);

        const computed = getComputedStyle(document.documentElement);
        const colors: Record<string, string> = {};
        for (const group of BUTTON_COLOR_GROUPS) {
          colors[group.backgroundVar] = resolvedColorToHex(computed.getPropertyValue(group.backgroundVar).trim());
          colors[group.colorVar] = resolvedColorToHex(computed.getPropertyValue(group.colorVar).trim());
        }
        setDefaultColors(colors);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !settings) return <p>Loading...</p>;

  const handleSymbolSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ octaveUpDisplaySymbol: settings.octaveUpDisplaySymbol }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const handleFontSizeChange = (field: FontSizeField, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    touchedRef.current[field] = value;
  };

  const handleFontSizeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const body: Record<string, string> = {};
    const nextErrors: Partial<Record<FontSizeField, string>> = {};

    for (const { key } of FONT_SIZE_FIELDS) {
      if (!(key in touchedRef.current)) continue;
      const value = settings[key];
      if (!CSS_LENGTH_PATTERN.test(value)) {
        nextErrors[key] = "Must be a CSS length like \"1.5rem\", \"24px\", or \"1.5em\"";
        continue;
      }
      body[key] = value;
    }

    setFontSizeErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (Object.keys(body).length === 0) return;

    try {
      const updated = await apiFetch<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSettings(updated);
      touchedRef.current = {};
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save font sizes");
    }
  };

  const handleColorChange = (field: keyof Settings, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleColorSave = async (field: keyof Settings) => {
    setError(null);
    setSaved(false);
    const value = settings[field];
    try {
      const updated = await apiFetch<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save color");
    }
  };

  const handleColorClear = async (field: keyof Settings) => {
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ [field]: null }),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear color");
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log out");
    }
  };

  return (
    <div className={styles.page}>
      <h1>Settings</h1>

      <form className={styles.form} onSubmit={handleSymbolSubmit}>
        <label className={styles.field}>
          <span>Octave-up display symbol</span>
          <input
            value={settings.octaveUpDisplaySymbol}
            onChange={(e) => setSettings({ ...settings, octaveUpDisplaySymbol: e.target.value })}
            required
          />
          <span className={styles.hint}>
            Chord sheets are stored with &quot;+&quot; internally and shown with this symbol instead.
          </span>
        </label>
        <button type="submit" className="btn btnPrimary">
          Save
        </button>
      </form>

      <form className={styles.form} onSubmit={handleFontSizeSubmit}>
        <h2>Font Sizes</h2>
        {FONT_SIZE_FIELDS.map(({ key, label }) => (
          <label className={styles.field} key={key}>
            <span>{label}</span>
            <input value={settings[key]} onChange={(e) => handleFontSizeChange(key, e.target.value)} />
            {fontSizeErrors[key] && <span className={styles.error}>{fontSizeErrors[key]}</span>}
          </label>
        ))}
        <button type="submit" className="btn btnPrimary">
          Save Font Sizes
        </button>
      </form>

      <div className={styles.form}>
        <h2>Button Colors</h2>
        {BUTTON_COLOR_GROUPS.map((group) => (
          <fieldset className={styles.colorGroup} key={group.label}>
            <legend>{group.label}</legend>

            <div className={styles.colorField}>
              <label>
                <span>Background</span>
                <input
                  type="color"
                  value={(settings[group.backgroundField] as string | null) ?? defaultColors[group.backgroundVar] ?? "#000000"}
                  onChange={(e) => handleColorChange(group.backgroundField, e.target.value)}
                />
              </label>
              <span className={styles.badge}>
                {settings[group.backgroundField] ? "Custom" : "Default"}
              </span>
              <button
                type="button"
                className="btn btnSecondary"
                onClick={() => handleColorSave(group.backgroundField)}
              >
                Save
              </button>
              <button
                type="button"
                className="btn btnSecondary"
                onClick={() => handleColorClear(group.backgroundField)}
                disabled={!settings[group.backgroundField]}
              >
                Clear
              </button>
            </div>

            <div className={styles.colorField}>
              <label>
                <span>Text</span>
                <input
                  type="color"
                  value={(settings[group.colorField] as string | null) ?? defaultColors[group.colorVar] ?? "#000000"}
                  onChange={(e) => handleColorChange(group.colorField, e.target.value)}
                />
              </label>
              <span className={styles.badge}>{settings[group.colorField] ? "Custom" : "Default"}</span>
              <button type="button" className="btn btnSecondary" onClick={() => handleColorSave(group.colorField)}>
                Save
              </button>
              <button
                type="button"
                className="btn btnSecondary"
                onClick={() => handleColorClear(group.colorField)}
                disabled={!settings[group.colorField]}
              >
                Clear
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <div className={styles.form}>
        <h2>Account</h2>
        <button type="button" className="btn btnDanger" onClick={handleLogout}>
          Log Out
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.saved}>Saved.</p>}
    </div>
  );
};

export default SettingsPage;
