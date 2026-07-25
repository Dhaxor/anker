import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, AlertTriangle, Check, TrendingDown } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProgress } from "@/contexts/ProgressContext";
import { useEntitlement } from "@/contexts/EntitlementContext";
import { useTheme } from "@/hooks/useTheme";
import { troubleSpots, weakestCategories, type Scored, type CategoryStanding } from "@/lib/review";
import { space, type, radius, elevation, MIN_TAP, type ThemeColors } from "@/constants/theme";

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const s = useMemo(() => styles(c), [c]);
  const { ready, region, cards } = useProgress();
  const { can } = useEntitlement();

  const [spots, setSpots] = useState<Scored[] | null>(null);
  const [topics, setTopics] = useState<CategoryStanding[]>([]);

  useEffect(() => {
    if (ready && !can("weakSpots")) {
      router.replace("/paywall");
      return;
    }
    if (!ready || !region) return;
    const now = Date.now();
    setSpots(troubleSpots(cards, region, now, 25));
    setTopics(weakestCategories(cards, region, now).slice(0, 4));
  }, [ready, region, cards, can, router]);

  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.back}
          testID="review-back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Schwachstellen</Text>
        <View style={{ width: 32 }} />
      </View>

      {spots === null ? (
        <View style={[s.screen, s.centered]}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {topics.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Themen</Text>
              {topics.map((t) => (
                <View key={t.category} style={s.topicRow} testID={`topic-${t.category}`}>
                  <TrendingDown size={16} color={t.strength < 0.7 ? c.warning : c.textMuted} />
                  <Text style={s.topicName}>{t.category}</Text>
                  <View style={s.topicTrack}>
                    <View
                      style={[
                        s.topicFill,
                        {
                          width: `${Math.round(t.strength * 100)}%`,
                          backgroundColor: t.strength < 0.7 ? c.warning : c.success,
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.topicPct}>{Math.round(t.strength * 100)}%</Text>
                </View>
              ))}
            </>
          )}

          <Text style={[s.sectionLabel, { marginTop: space.lg }]}>
            Fragen, die Ihnen schwerfallen
          </Text>

          {spots.length === 0 ? (
            <View style={s.empty} testID="review-empty">
              <View style={s.emptyBadge}>
                <Check size={24} color={c.success} />
              </View>
              <Text style={s.emptyHead}>Keine Schwachstellen</Text>
              <Text style={s.emptySub}>
                Sobald Sie eine Frage falsch beantworten, sammeln wir sie hier — damit Sie genau
                das üben, was noch fehlt.
              </Text>
            </View>
          ) : (
            spots.map((spot) => {
              const q = spot.question;
              const open = openId === q.id;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={s.card}
                  activeOpacity={0.75}
                  testID={`trouble-${q.id}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setOpenId(open ? null : q.id);
                  }}
                >
                  <View style={s.cardTop}>
                    {spot.lapses > 0 && (
                      <View style={s.lapseTag}>
                        <AlertTriangle size={11} color={c.danger} />
                        <Text style={s.lapseText}>
                          {spot.lapses}× falsch
                        </Text>
                      </View>
                    )}
                    <Text style={s.strengthText}>{Math.round(spot.p * 100)}% sicher</Text>
                  </View>
                  <Text style={s.cardQuestion}>{q.question}</Text>
                  {open && (
                    <View style={s.answerBox} testID={`answer-${q.id}`}>
                      <Check size={15} color={c.success} />
                      <Text style={s.answerText}>{q.options[q.correct]}</Text>
                    </View>
                  )}
                  {!open && <Text style={s.tapHint}>Tippen für die richtige Antwort</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    centered: { alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space.base,
      paddingBottom: space.md,
    },
    back: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    headerTitle: { ...type.bodyStrong, color: c.text },

    content: { paddingHorizontal: space.lg, paddingTop: space.sm },
    sectionLabel: { ...type.caption, color: c.textMuted, marginBottom: space.md },

    topicRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.md },
    topicName: { ...type.caption, color: c.text, width: 96 },
    topicTrack: {
      flex: 1,
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      overflow: "hidden",
    },
    topicFill: { height: 6, borderRadius: radius.pill },
    topicPct: {
      ...type.caption,
      color: c.textMuted,
      width: 38,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },

    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.base,
      marginBottom: space.md,
      minHeight: MIN_TAP,
      ...elevation(c, 1),
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
    lapseTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: c.dangerSoft,
    },
    lapseText: { ...type.caption, color: c.danger, fontWeight: "600" },
    strengthText: { ...type.caption, color: c.textMuted, marginLeft: "auto" },
    cardQuestion: { ...type.body, color: c.text, lineHeight: 22 },
    tapHint: { ...type.caption, color: c.textMuted, marginTop: space.sm },
    answerBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space.sm,
      marginTop: space.md,
      padding: space.md,
      borderRadius: radius.sm,
      backgroundColor: c.successSoft,
    },
    answerText: { ...type.body, color: c.success, flex: 1, lineHeight: 21 },

    empty: { alignItems: "center", paddingVertical: space.xl },
    emptyBadge: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: c.successSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space.base,
    },
    emptyHead: { ...type.title, color: c.text },
    emptySub: {
      ...type.body,
      color: c.textSecondary,
      textAlign: "center",
      marginTop: space.sm,
      paddingHorizontal: space.base,
    },
  });
