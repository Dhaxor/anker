import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  GraduationCap,
  Flame,
  ChevronRight,
  Target,
  BookOpen,
  AlertTriangle,
  Settings as SettingsIcon,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProgress } from "@/contexts/ProgressContext";
import { BUNDESLAENDER, EXAM_PASS_MARK, EXAM_TOTAL } from "@/lib/questionBank";
import { readinessLabel, displayPercent } from "@/lib/readiness";
import { palette, space, type, radius, elevation, MIN_TAP, type ThemeColors } from "@/constants/theme";

const LABEL_COPY = {
  "not-ready": { head: "Noch nicht bereit", sub: "Üben Sie weiter — Sie schaffen das." },
  borderline: { head: "Knapp", sub: "Ein bisschen mehr Übung macht es sicher." },
  ready: { head: "Auf gutem Weg", sub: "Sie würden die Prüfung wahrscheinlich bestehen." },
  confident: { head: "Bereit", sub: "Sie bestehen die Prüfung mit hoher Sicherheit." },
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palette.dark : palette.light;
  const s = useMemo(() => styles(c), [c]);
  const { ready, region, setRegion, readiness, streak } = useProgress();

  if (!ready) {
    return (
      <View style={[s.screen, s.centered]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // Empty state as guidance, not a dead end: pick a Bundesland to unlock the
  // 3 state-specific questions every real exam contains.
  if (!region) {
    return (
      <ScrollView
        style={s.screen}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.xl }]}
      >
        <View style={s.badge}>
          <GraduationCap size={26} color={c.primary} />
        </View>
        <Text style={s.h1}>Willkommen bei Anker</Text>
        <Text style={s.lead}>
          Der Einbürgerungstest hat {EXAM_TOTAL} Fragen. Drei davon kommen aus Ihrem Bundesland.
          Welches ist es?
        </Text>
        <View style={s.landGrid}>
          {BUNDESLAENDER.map((land) => (
            <TouchableOpacity
              key={land}
              style={s.landChip}
              activeOpacity={0.7}
              testID={`land-${land}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRegion(land);
              }}
            >
              <Text style={s.landText}>{land}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  const r = readiness!;
  const label = readinessLabel(r);
  const copy = LABEL_COPY[label];
  const pct = displayPercent(r.passProbability);
  const accent = label === "not-ready" ? c.warning : label === "borderline" ? c.warning : c.success;
  const accentSoft = label === "ready" || label === "confident" ? c.successSoft : c.warningSoft;

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerRow}>
          <View>
            <Text style={s.eyebrow}>Einbürgerungstest</Text>
            <Text style={s.h1}>{region}</Text>
          </View>
          <View style={s.headerRight}>
            {streak > 0 && (
              <View style={s.streak} testID="streak-chip">
                <Flame size={14} color={c.warning} />
                <Text style={s.streakText}>{streak}</Text>
              </View>
            )}
            <TouchableOpacity
              testID="open-settings"
              style={s.gear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push("/settings");
              }}
            >
              <SettingsIcon size={19} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero: the one question a candidate actually has. */}
        <View style={[s.hero, { borderColor: accentSoft }]} testID="readiness-card">
          <Text style={s.heroLabel}>Ihr voraussichtliches Ergebnis</Text>
          <View style={s.scoreRow}>
            <Text style={[s.score, { color: accent }]} testID="expected-score">
              {r.expectedScore.toFixed(0)}
            </Text>
            <Text style={s.scoreOf}>von {EXAM_TOTAL}</Text>
          </View>
          <View style={s.track}>
            <View
              style={[
                s.trackFill,
                { width: `${Math.min(100, (r.expectedScore / EXAM_TOTAL) * 100)}%`, backgroundColor: accent },
              ]}
            />
            <View style={[s.passMark, { left: `${(EXAM_PASS_MARK / EXAM_TOTAL) * 100}%` }]} />
          </View>
          <Text style={s.passHint}>Zum Bestehen brauchen Sie {EXAM_PASS_MARK} richtige Antworten</Text>
          <View style={s.divider} />
          <Text style={[s.heroHead, { color: accent }]}>{copy.head}</Text>
          <Text style={s.heroSub}>
            {copy.sub} Bestehenswahrscheinlichkeit: {pct}%.
          </Text>
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{r.seen}</Text>
            <Text style={s.statLabel}>gesehen</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{r.strong}</Text>
            <Text style={s.statLabel}>sicher</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{r.pool}</Text>
            <Text style={s.statLabel}>insgesamt</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.secondary}
          activeOpacity={0.7}
          testID="open-review"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/review");
          }}
        >
          <View style={s.secondaryIcon}>
            <AlertTriangle size={18} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.secondaryTitle}>Schwachstellen</Text>
            <Text style={s.secondarySub}>Was Sie immer wieder falsch beantworten</Text>
          </View>
          <ChevronRight size={18} color={c.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondary}
          activeOpacity={0.7}
          testID="start-exam"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/exam");
          }}
        >
          <View style={s.secondaryIcon}>
            <Target size={18} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.secondaryTitle}>Prüfung simulieren</Text>
            <Text style={s.secondarySub}>{EXAM_TOTAL} Fragen, 60 Minuten — wie im Amt</Text>
          </View>
          <ChevronRight size={18} color={c.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Primary action lives in the thumb zone, above the home indicator. */}
      <View style={[s.dock, { paddingBottom: insets.bottom + space.base }]}>
        <TouchableOpacity
          style={s.primary}
          activeOpacity={0.85}
          testID="start-practice"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/practice");
          }}
        >
          <BookOpen size={18} color={c.onPrimary} />
          <Text style={s.primaryText}>Üben</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    centered: { alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: space.lg },

    badge: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space.base,
    },
    h1: { ...type.display, color: c.text },
    lead: { ...type.body, color: c.textSecondary, marginTop: space.sm, marginBottom: space.lg },

    landGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    landChip: {
      paddingHorizontal: space.base,
      paddingVertical: space.md,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: MIN_TAP,
      justifyContent: "center",
    },
    landText: { ...type.captionStrong, color: c.text },

    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: space.lg,
    },
    eyebrow: { ...type.caption, color: c.textMuted, marginBottom: space.xs },
    headerRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
    gear: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
    streak: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.pill,
      backgroundColor: c.warningSoft,
    },
    streakText: { ...type.captionStrong, color: c.warning },

    hero: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: space.lg,
      ...elevation(c, 1),
    },
    heroLabel: { ...type.caption, color: c.textMuted },
    scoreRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.xs },
    score: { fontSize: 52, lineHeight: 58, fontWeight: "700", fontVariant: ["tabular-nums"] },
    scoreOf: { ...type.body, color: c.textMuted },
    track: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      marginTop: space.md,
      overflow: "visible",
      justifyContent: "center",
    },
    trackFill: { height: 8, borderRadius: radius.pill },
    passMark: {
      position: "absolute",
      width: 2,
      height: 16,
      backgroundColor: c.textMuted,
      borderRadius: 1,
    },
    passHint: { ...type.caption, color: c.textMuted, marginTop: space.md },
    divider: { height: 1, backgroundColor: c.border, marginVertical: space.base },
    heroHead: { ...type.title },
    heroSub: { ...type.body, color: c.textSecondary, marginTop: space.xs },

    statRow: { flexDirection: "row", gap: space.md, marginTop: space.base },
    stat: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space.md,
      alignItems: "center",
    },
    statValue: { ...type.title, color: c.text, fontVariant: ["tabular-nums"] },
    statLabel: { ...type.caption, color: c.textMuted, marginTop: 2 },

    secondary: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.base,
      marginTop: space.base,
      minHeight: MIN_TAP,
    },
    secondaryIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.sm,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryTitle: { ...type.bodyStrong, color: c.text },
    secondarySub: { ...type.caption, color: c.textMuted, marginTop: 2 },

    dock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      backgroundColor: c.background,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    primary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space.sm,
      height: 54,
      borderRadius: radius.lg,
      backgroundColor: c.primary,
      ...elevation(c, 1),
    },
    primaryText: { ...type.bodyStrong, color: c.onPrimary },
  });
