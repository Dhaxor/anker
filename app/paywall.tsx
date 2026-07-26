import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, Check, Target, AlertTriangle, Gauge, Anchor } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useEntitlement } from "@/contexts/EntitlementContext";
import { useTheme } from "@/hooks/useTheme";
import { EXAM_TOTAL } from "@/lib/questionBank";
import { space, type, radius, elevation, MIN_TAP, type ThemeColors } from "@/constants/theme";

const BENEFITS = [
  {
    icon: Target,
    title: "Unbegrenzte Prüfungssimulationen",
    body: `${EXAM_TOTAL} Fragen, 60 Minuten, echte Bedingungen — so oft Sie wollen.`,
  },
  {
    icon: AlertTriangle,
    title: "Ihre Schwachstellen",
    body: "Genau die Fragen, die Sie immer wieder falsch beantworten — nach Häufigkeit sortiert.",
  },
  {
    icon: Gauge,
    title: "Ihre Bestehenswahrscheinlichkeit",
    body: "Kein Fortschrittsbalken, sondern eine echte Prognose: Wie viele Punkte hätten Sie heute?",
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const s = useMemo(() => styles(c), [c]);
  const { purchase, restore, priceLabel } = useEntitlement();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string>, failMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      if (result === "purchased") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else if (result === "unavailable") {
        Alert.alert(
          "Noch nicht verfügbar",
          "Der Kauf wird mit der nächsten Version freigeschaltet. Bis dahin bleibt das Üben vollständig kostenlos."
        );
      } else if (result === "failed") {
        Alert.alert("Fehlgeschlagen", failMessage);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + 170 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={s.close}
          onPress={() => router.back()}
          testID="paywall-close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={22} color={c.textMuted} />
        </TouchableOpacity>

        <View style={s.badge}>
          <Anchor size={28} color={c.primary} />
        </View>
        <Text style={s.h1}>Anker Pro</Text>
        <Text style={s.lead}>
          Alle 460 Fragen bleiben für immer kostenlos. Pro schaltet die Werkzeuge
          frei, mit denen Sie gezielt auf die Prüfung hinarbeiten.
        </Text>

        <View style={s.card}>
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <View key={title} style={s.benefit}>
              <View style={s.benefitIcon}>
                <Icon size={17} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.benefitTitle}>{title}</Text>
                <Text style={s.benefitBody}>{body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.reassure}>
          <Check size={15} color={c.success} />
          <Text style={s.reassureText}>
            Einmalzahlung, kein Abo. Sie zahlen einmal und behalten es — auch nach der Prüfung.
          </Text>
        </View>
        <View style={s.reassure}>
          <Check size={15} color={c.success} />
          <Text style={s.reassureText}>
            Funktioniert vollständig offline. Keine Anmeldung, kein Konto, keine Daten an Dritte.
          </Text>
        </View>
      </ScrollView>

      <View style={[s.dock, { paddingBottom: insets.bottom + space.base }]}>
        <TouchableOpacity
          style={s.primary}
          activeOpacity={0.85}
          testID="paywall-buy"
          onPress={() => void run(purchase, "Der Kauf konnte nicht abgeschlossen werden.")}
        >
          {busy ? (
            <ActivityIndicator color={c.onPrimary} />
          ) : (
            <Text style={s.primaryText}>
              {priceLabel ? `Anker Pro freischalten · ${priceLabel}` : "Anker Pro freischalten"}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.ghost}
          testID="paywall-restore"
          onPress={() => void run(restore, "Es wurde kein früherer Kauf gefunden.")}
        >
          <Text style={s.ghostText}>Kauf wiederherstellen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: space.lg },
    close: { alignSelf: "flex-end", width: 32, height: 32, alignItems: "center", justifyContent: "center" },

    badge: {
      width: 60,
      height: 60,
      borderRadius: radius.lg,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space.base,
    },
    h1: { ...type.display, color: c.text },
    lead: { ...type.body, color: c.textSecondary, marginTop: space.sm, marginBottom: space.lg },

    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.base,
      gap: space.base,
      ...elevation(c, 1),
    },
    benefit: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
    benefitIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    benefitTitle: { ...type.bodyStrong, color: c.text },
    benefitBody: { ...type.caption, color: c.textSecondary, marginTop: 2, lineHeight: 18 },

    reassure: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", marginTop: space.base },
    reassureText: { ...type.caption, color: c.textSecondary, flex: 1, lineHeight: 18 },

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
      height: 54,
      borderRadius: radius.lg,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      ...elevation(c, 1),
    },
    primaryText: { ...type.bodyStrong, color: c.onPrimary },
    ghost: { height: MIN_TAP, alignItems: "center", justifyContent: "center", marginTop: space.xs },
    ghostText: { ...type.caption, color: c.textMuted },
  });
