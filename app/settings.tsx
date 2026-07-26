import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Check, MapPin, RotateCcw, Anchor, FileText, Shield } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useProgress } from "@/contexts/ProgressContext";
import { useEntitlement } from "@/contexts/EntitlementContext";
import { useTheme } from "@/hooks/useTheme";
import { BUNDESLAENDER, allQuestions, type Bundesland } from "@/lib/questionBank";
import { space, type, radius, MIN_TAP, type ThemeColors } from "@/constants/theme";

const CATALOGUE_URL =
  "https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf";
const PRIVACY_URL = "https://dhaxor.github.io/anker/datenschutz.html";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const s = useMemo(() => styles(c), [c]);
  const { region, setRegion, reset } = useProgress();
  const { state, restore } = useEntitlement();
  const [picking, setPicking] = useState(false);

  const verified = useMemo(
    () => allQuestions().filter((q) => q.verifiedAgainstOfficialCatalogue).length,
    []
  );
  const total = allQuestions().length;

  const confirmReset = () => {
    Alert.alert(
      "Fortschritt zurücksetzen?",
      "Alle Antworten, Schwachstellen und Prüfungsergebnisse werden gelöscht. Ihr Kauf bleibt erhalten.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Zurücksetzen",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            reset();
          },
        },
      ]
    );
  };

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.back}
          testID="settings-back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Einstellungen</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionLabel}>Bundesland</Text>
        <TouchableOpacity
          style={s.row}
          testID="settings-region"
          activeOpacity={0.7}
          onPress={() => {
            void Haptics.selectionAsync();
            setPicking((v) => !v);
          }}
        >
          <MapPin size={18} color={c.primary} />
          <Text style={s.rowLabel}>{region ?? "Nicht gewählt"}</Text>
          <Text style={s.rowAction}>{picking ? "Schließen" : "Ändern"}</Text>
        </TouchableOpacity>
        {picking && (
          <View style={s.landGrid}>
            {BUNDESLAENDER.map((land) => {
              const active = land === region;
              return (
                <TouchableOpacity
                  key={land}
                  testID={`settings-land-${land}`}
                  style={[s.landChip, active && { borderColor: c.primary, backgroundColor: c.primarySoft }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setRegion(land as Bundesland);
                    setPicking(false);
                  }}
                >
                  <Text style={[s.landText, active && { color: c.primary }]}>{land}</Text>
                  {active && <Check size={13} color={c.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <Text style={s.hint}>
          Drei der 33 Prüfungsfragen kommen aus Ihrem Bundesland. Wenn Sie umziehen, ändern Sie es
          hier.
        </Text>

        <Text style={[s.sectionLabel, { marginTop: space.lg }]}>Kauf</Text>
        <View style={s.row}>
          <Anchor size={18} color={state.pro ? c.success : c.textMuted} />
          <Text style={s.rowLabel}>{state.pro ? "Anker Pro aktiv" : "Kostenlose Version"}</Text>
        </View>
        {!state.pro && (
          <>
            <TouchableOpacity
              style={s.row}
              testID="settings-upgrade"
              activeOpacity={0.7}
              onPress={() => router.push("/paywall")}
            >
              <Text style={[s.rowLabel, { color: c.primary, marginLeft: 0 }]}>
                Anker Pro freischalten
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.row}
              testID="settings-restore"
              activeOpacity={0.7}
              onPress={() => void restore()}
            >
              <Text style={[s.rowLabel, { marginLeft: 0 }]}>Kauf wiederherstellen</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={[s.sectionLabel, { marginTop: space.lg }]}>Fragen</Text>
        <TouchableOpacity
          style={s.row}
          testID="settings-source"
          activeOpacity={0.7}
          onPress={() => void Linking.openURL(CATALOGUE_URL)}
        >
          <FileText size={18} color={c.primary} />
          <Text style={s.rowLabel}>Amtlicher Fragenkatalog</Text>
          <Text style={s.rowAction}>Öffnen</Text>
        </TouchableOpacity>
        {/* Say plainly what we checked and what we did not — an exam app that
            overstates its provenance deserves the 1-star review it will get. */}
        <Text style={s.hint}>
          {total} Fragen aus dem Gesamtfragenkatalog des BAMF. {verified} davon haben wir Wort für
          Wort mit dem amtlichen Dokument abgeglichen; die übrigen sind Bildfragen oder konnten
          nicht automatisch geprüft werden und sind in der Übung entsprechend gekennzeichnet. Anker
          ist keine amtliche App des BAMF.
        </Text>

        <Text style={[s.sectionLabel, { marginTop: space.lg }]}>Rechtliches</Text>
        <TouchableOpacity
          style={s.row}
          testID="settings-privacy"
          activeOpacity={0.7}
          onPress={() => void Linking.openURL(PRIVACY_URL)}
        >
          <Shield size={18} color={c.primary} />
          <Text style={s.rowLabel}>Datenschutz</Text>
          <Text style={s.rowAction}>Öffnen</Text>
        </TouchableOpacity>
        <Text style={s.hint}>
          Anker erhebt keine Daten. Ihr Fortschritt bleibt auf diesem Gerät.
        </Text>

        <Text style={[s.sectionLabel, { marginTop: space.lg }]}>Fortschritt</Text>
        <TouchableOpacity style={s.row} testID="settings-reset" activeOpacity={0.7} onPress={confirmReset}>
          <RotateCcw size={18} color={c.danger} />
          <Text style={[s.rowLabel, { color: c.danger }]}>Fortschritt zurücksetzen</Text>
        </TouchableOpacity>

        <Text style={s.version}>
          Anker {Constants.expoConfig?.version ?? "1.0.0"} · funktioniert offline
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
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
    sectionLabel: { ...type.caption, color: c.textMuted, marginBottom: space.sm },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      minHeight: MIN_TAP,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
      marginBottom: space.sm,
    },
    rowLabel: { ...type.body, color: c.text, flex: 1 },
    rowAction: { ...type.caption, color: c.primary, fontWeight: "600" },

    landGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.sm },
    landChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: MIN_TAP,
    },
    landText: { ...type.caption, color: c.text },

    hint: { ...type.caption, color: c.textMuted, lineHeight: 18, marginBottom: space.sm },
    version: { ...type.caption, color: c.textMuted, textAlign: "center", marginTop: space.xl },
  });
