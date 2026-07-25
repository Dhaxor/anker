import React, { useEffect, useMemo, useState } from "react";
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
import { X, Check, ArrowRight, PartyPopper } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProgress } from "@/contexts/ProgressContext";
import { GRADE } from "@/lib/fsrs";
import { Question } from "@/lib/questionBank";
import { palette, space, type, radius, elevation, MIN_TAP, type ThemeColors } from "@/constants/theme";

const SESSION_LENGTH = 12;

export default function PracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palette.dark : palette.light;
  const s = useMemo(() => styles(c), [c]);
  const { ready, queue, answer } = useProgress();

  // Built once, then frozen, so grading mid-session cannot reshuffle the queue.
  // It must wait for the stored progress to load — building it eagerly caught a
  // real bug where a cold launch straight into practice saw an empty pool and
  // showed "nothing to review" despite 310 unseen questions.
  const [questions, setQuestions] = useState<Question[] | null>(null);
  useEffect(() => {
    if (ready && questions === null) setQuestions(queue(SESSION_LENGTH));
  }, [ready, questions, queue]);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const q = questions?.[index];
  const done = questions !== null && index >= questions.length;

  const onPick = (choice: number) => {
    if (picked !== null || !q) return;
    const isRight = choice === q.correct;
    setPicked(choice);
    if (isRight) setCorrectCount((n) => n + 1);
    void Haptics.notificationAsync(
      isRight ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    // A wrong answer is information, not a penalty: it just schedules the
    // question sooner. Nothing is deducted, nothing is locked.
    answer(q.id, isRight ? GRADE.GOOD : GRADE.AGAIN);
  };

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPicked(null);
    setIndex((i) => i + 1);
  };

  if (questions === null) {
    return (
      <View style={[s.screen, s.centered]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[s.screen, s.centered, { paddingTop: insets.top }]}>
        <Text style={s.doneHead}>Alles erledigt</Text>
        <Text style={s.doneSub}>Für heute gibt es nichts zu wiederholen. Kommen Sie morgen wieder.</Text>
        <TouchableOpacity style={s.primary} onPress={() => router.back()} testID="practice-close">
          <Text style={s.primaryText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // The end of the session is the last thing they remember, so it closes with
  // what they achieved rather than just dumping them back on the home screen.
  if (done) {
    return (
      <View style={[s.screen, s.centered, { paddingTop: insets.top, paddingHorizontal: space.lg }]}>
        <View style={s.celebrate}>
          <PartyPopper size={30} color={c.primary} />
        </View>
        <Text style={s.doneHead} testID="session-summary">
          {correctCount} von {questions.length} richtig
        </Text>
        <Text style={s.doneSub}>
          {correctCount === questions.length
            ? "Fehlerfrei. Diese Fragen sitzen."
            : "Die Fragen, die Sie verpasst haben, kommen bald wieder — genau dann, wenn es am meisten hilft."}
        </Text>
        <TouchableOpacity style={s.primary} onPress={() => router.back()} testID="practice-done">
          <Text style={s.primaryText}>Fertig</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!q) return null; // unreachable once `done` is handled, but narrows the type

  const answered = picked !== null;

  return (
    <View style={s.screen}>
      <View style={[s.topBar, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.close}
          testID="practice-exit"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={22} color={c.textMuted} />
        </TouchableOpacity>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${(index / questions.length) * 100}%` }]} />
        </View>
        <Text style={s.counter}>
          {index + 1}/{questions.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {q.region !== "Allgemein" && <Text style={s.regionTag}>{q.region}</Text>}
        <Text style={s.question} testID="question-text">
          {q.question}
        </Text>

        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct;
          const isPicked = i === picked;
          const showRight = answered && isCorrect;
          const showWrong = answered && isPicked && !isCorrect;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={answered ? 1 : 0.7}
              onPress={() => onPick(i)}
              testID={`option-${i}`}
              style={[
                s.option,
                showRight && { borderColor: c.success, backgroundColor: c.successSoft },
                showWrong && { borderColor: c.danger, backgroundColor: c.dangerSoft },
              ]}
            >
              <Text
                style={[
                  s.optionText,
                  showRight && { color: c.success },
                  showWrong && { color: c.danger },
                ]}
              >
                {opt}
              </Text>
              {showRight && <Check size={18} color={c.success} />}
              {showWrong && <X size={18} color={c.danger} />}
            </TouchableOpacity>
          );
        })}

        {answered && !q.verifiedAgainstOfficialCatalogue && (
          <Text style={s.note} testID="provenance-note">
            Hinweis: Diese Frage konnten wir nicht automatisch mit dem amtlichen Katalog abgleichen.
          </Text>
        )}
      </ScrollView>

      {answered && (
        <View style={[s.dock, { paddingBottom: insets.bottom + space.base }]}>
          <TouchableOpacity style={s.primary} onPress={next} testID="next-question" activeOpacity={0.85}>
            <Text style={s.primaryText}>Weiter</Text>
            <ArrowRight size={18} color={c.onPrimary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    centered: { alignItems: "center", justifyContent: "center" },

    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      paddingHorizontal: space.base,
      paddingBottom: space.md,
    },
    close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      overflow: "hidden",
    },
    progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: c.primary },
    counter: { ...type.caption, color: c.textMuted, fontVariant: ["tabular-nums"] },

    content: { paddingHorizontal: space.lg, paddingTop: space.base },
    regionTag: { ...type.caption, color: c.primary, marginBottom: space.sm },
    question: { ...type.title, color: c.text, marginBottom: space.lg, lineHeight: 28 },

    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      minHeight: MIN_TAP + 12,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
      marginBottom: space.md,
    },
    optionText: { ...type.body, color: c.text, flex: 1 },
    note: { ...type.caption, color: c.textMuted, marginTop: space.sm, lineHeight: 18 },

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
      paddingHorizontal: space.xl,
      ...elevation(c, 1),
    },
    primaryText: { ...type.bodyStrong, color: c.onPrimary },

    celebrate: {
      width: 64,
      height: 64,
      borderRadius: radius.xl,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space.base,
    },
    doneHead: { ...type.display, color: c.text, textAlign: "center" },
    doneSub: {
      ...type.body,
      color: c.textSecondary,
      textAlign: "center",
      marginTop: space.sm,
      marginBottom: space.lg,
      paddingHorizontal: space.base,
    },
  });
