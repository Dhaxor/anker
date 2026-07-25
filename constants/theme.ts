// Curo design system — single source of truth. No screen may hardcode a hex
// value or a raw spacing number; everything comes from here.
//
// Direction: clinical calm. The audience is nurses, EMTs and students, often
// mid-shift and tired, so the palette avoids both the sterile hospital blue
// that reads as "software you're forced to use" and the candy gamification
// that reads as unserious to a professional. Deep teal carries the care
// association; the base is warm rather than clinical white.

/** 60 / 30 / 10 — neutral base, complementary dark, accent. */
export const palette = {
  light: {
    // 60% — base
    background: "#FBFAF8",
    surface: "#FFFFFF",
    surfaceSunken: "#F4F2EF",
    // 30% — complementary
    text: "#111A1C",
    textSecondary: "rgba(17, 26, 28, 0.72)",
    textMuted: "rgba(17, 26, 28, 0.52)",
    border: "rgba(17, 26, 28, 0.10)",
    // 10% — accent
    primary: "#0E7C72",
    primarySoft: "rgba(14, 124, 114, 0.08)",
    primaryBorder: "rgba(14, 124, 114, 0.22)",
    onPrimary: "#FFFFFF",
    // semantic — used sparingly so they keep their meaning
    success: "#12855A",
    successSoft: "rgba(18, 133, 90, 0.10)",
    danger: "#C0453D",
    dangerSoft: "rgba(192, 69, 61, 0.10)",
    warning: "#B87514",
    warningSoft: "rgba(184, 117, 20, 0.12)",
    /** shadows are tinted to the background, never neutral grey */
    shadow: "rgba(31, 41, 43, 0.10)",
  },
  dark: {
    background: "#0E1416",
    surface: "#161F21",
    surfaceSunken: "#111A1C",
    text: "#F2F5F4",
    textSecondary: "rgba(242, 245, 244, 0.74)",
    textMuted: "rgba(242, 245, 244, 0.54)",
    border: "rgba(242, 245, 244, 0.12)",
    primary: "#3FBFAE",
    primarySoft: "rgba(63, 191, 174, 0.12)",
    primaryBorder: "rgba(63, 191, 174, 0.28)",
    onPrimary: "#06201D",
    success: "#3BC489",
    successSoft: "rgba(59, 196, 137, 0.14)",
    danger: "#E8776E",
    dangerSoft: "rgba(232, 119, 110, 0.14)",
    warning: "#E0A33F",
    warningSoft: "rgba(224, 163, 63, 0.16)",
    shadow: "rgba(0, 0, 0, 0.45)",
  },
} as const;

/** Widened so the dark palette is assignable too — `as const` above would
 *  otherwise pin every value to its light-mode literal. */
export type ThemeColors = { [K in keyof (typeof palette)["light"]]: string };

/** 8-point grid. Nothing outside this scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/** Four sizes, two weights — the skill's hard ceiling. */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  /** tabular figures for counters, timers and scores */
  metric: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700" as const,
    fontVariant: ["tabular-nums"] as const,
  },
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Soft, background-tinted elevation. Never a hard grey drop shadow. */
export function elevation(colors: ThemeColors, level: 1 | 2 = 1) {
  return {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: level === 1 ? 12 : 24,
    shadowOffset: { width: 0, height: level === 1 ? 4 : 10 },
    elevation: level === 1 ? 2 : 6,
  };
}

/** Minimum interactive size, per Apple HIG and the skill. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TAP = 44;
