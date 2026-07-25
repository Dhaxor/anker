import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, ArrowRight, Award, RotateCcw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProgress } from "@/contexts/ProgressContext";
import { useEntitlement } from "@/contexts/EntitlementContext";
import { GRADE } from "@/lib/fsrs";
import {
  EXAM_MINUTES,
  EXAM_PASS_MARK,
  EXAM_TOTAL,
  Question,
  buildExam,
} from "@/lib/questionBank";
import { palette, space, type, radius, elevation, MIN_TAP, type ThemeColors } from "@/constants/theme";

function mmss(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ExamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palette.dark : palette.light;
  const s = useMemo(() => styles(c), [c]);
  const { ready, region, answer, recordAttempt } = useProgress();
  const { can, noteExamTaken } = useEntitlement();

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(EXAM_MINUTES * 60);
  const graded = useRef(false);

  useEffect(() => {
    if (ready && !can("exam")) {
      router.replace("/paywall");
      return;
    }
    if (ready && region && questions === null) {
      const exam = buildExam(region, Date.now());
      setQuestions(exam);
      setPicks(Array(exam.length).fill(null));
    }
  }, [ready, region, questions, can, router]);

  // Real exams are timed; practising untimed then meeting a clock on the day is
  // the classic failure mode.
  useEffect(() => {
    if (questions === null || submitted) return;
    const t = setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [questions, submitted]);

  const score = useMemo(
    () =>
      questions === null
        ? 0
        : questions.reduce((n, q, i) => (picks[i] === q.correct ? n + 1 : n), 0),
    [questions, picks]
  );

  const finish = React.useCallback(() => {
    if (graded.current || questions === null) return;
    graded.current = true;
    const correct = questions.reduce((n, q, i) => (picks[i] === q.correct ? n + 1 : n), 0);
    const passed = correct >= EXAM_PASS_MARK;
    // Feed the result back into the scheduler so the exam doubles as a review.
    questions.forEach((q, i) => answer(q.id, picks[i] === q.correct ? GRADE.GOOD : GRADE.AGAIN));
    recordAttempt(correct, passed);
    noteExamTaken();
    void Haptics.notificationAsync(
      passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    setSubmitted(true);
  }, [questions, picks, answer, recordAttempt, noteExamTaken]);

  useEffect(() => {
    if (secondsLeft === 0 && questions !== null && !submitted) finish();
  }, [secondsLeft, questions, submitted, finish]);

  if (questions === null) {
    return (
      <View style={[s.screen, s.centered]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // The peak moment of the whole product: the verdict.
  if (submitted) {
    const passed = score >= EXAM_PASS_MARK;
    const accent = passed ? c.success : c.warning;
    return (
      <ScrollView
        style={s.screen}
        contentContainerStyle={[s.resultWrap, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
      >
        <View style={[s.resultBadge, { backgroundColor: passed ? c.successSoft : c.warningSoft }]}>
          <Award size={34} color={accent} />
        </View>
        <Text style={[s.resultScore, { color: accent }]} testID="exam-score">
          {score} / {EXAM_TOTAL}
        </Text>
        <Text style={s.resultHead} testID="exam-verdict">
          {passed ? "Bestanden" : "Noch nicht bestanden"}
        </Text>
        <Text style={s.resultSub}>
          {passed
            ? `Sie liegen ${score - EXAM_PASS_MARK} Punkte über der Grenze von ${EXAM_PASS_MARK}. So sicher würden Sie auch im Amt bestehen.`
            : `Sie brauchen ${EXAM_PASS_MARK} richtige Antworten — es fehlen noch ${EXAM_PASS_MARK - score}. Die Fragen, die Sie verpasst haben, stehen jetzt oben in Ihrer Übung.`}
        </Text>

        <TouchableOpacity
          style={s.primary}
          testID="exam-again"
          activeOpacity={0.85}
          onPress={() => {
            graded.current = false;
            const next = buildExam(region!, Date.now());
            setQuestions(next);
            setPicks(Array(next.length).fill(null));
            setIndex(0);
            setSecondsLeft(EXAM_MINUTES * 60);
            setSubmitted(false);
          }}
        >
          <RotateCcw size={18} color={c.onPrimary} />
          <Text style={s.primaryText}>Noch einmal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={() => router.back()} testID="exam-close">
          <Text style={s.ghostText}>Zur Übersicht</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answeredCount = picks.filter((p) => p !== null).length;

  return (
    <View style={s.screen}>
      <View style={[s.topBar, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity
          testID="exam-exit"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() =>
            Alert.alert("Prüfung abbrechen?", "Ihr Ergebnis wird nicht gespeichert.", [
              { text: "Weiter üben", style: "cancel" },
              { text: "Abbrechen", style: "destructive", onPress: () => router.back() },
            ])
          }
        >
          <X size={22} color={c.textMuted} />
        </TouchableOpacity>
        <Text style={s.counter}>
          Frage {index + 1} von {questions.length}
        </Text>
        <Text style={[s.timer, secondsLeft < 300 && { color: c.danger }]} testID="exam-timer">
          {mmss(secondsLeft)}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {q.region !== "Allgemein" && <Text style={s.regionTag}>{q.region}</Text>}
        <Text style={s.question} testID="exam-question">
          {q.question}
        </Text>
        {q.options.map((opt, i) => {
          const chosen = picks[index] === i;
          return (
            <TouchableOpacity
              key={i}
              testID={`exam-option-${i}`}
              activeOpacity={0.7}
              style={[s.option, chosen && { borderColor: c.primary, backgroundColor: c.primarySoft }]}
              onPress={() => {
                void Haptics.selectionAsync();
                setPicks((prev) => prev.map((p, j) => (j === index ? i : p)));
              }}
            >
              <View style={[s.radio, chosen && { borderColor: c.primary, backgroundColor: c.primary }]} />
              <Text style={[s.optionText, chosen && { color: c.primary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
        {/* No feedback until the end — that is what makes it a rehearsal. */}
      </ScrollView>

      <View style={[s.dock, { paddingBottom: insets.bottom + space.base }]}>
        <TouchableOpacity
          style={s.primary}
          activeOpacity={0.85}
          testID={isLast ? "exam-submit" : "exam-next"}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (isLast) {
              if (answeredCount < questions.length) {
                Alert.alert(
                  "Abgeben?",
                  `${questions.length - answeredCount} Fragen sind noch offen.`,
                  [
                    { text: "Zurück", style: "cancel" },
                    { text: "Trotzdem abgeben", onPress: finish },
                  ]
                );
              } else {
                finish();
              }
            } else {
              setIndex((i) => i + 1);
            }
          }}
        >
          <Text style={s.primaryText}>{isLast ? "Abgeben" : "Weiter"}</Text>
          <ArrowRight size={18} color={c.onPrimary} />
        </TouchableOpacity>
      </View>
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
      justifyContent: "space-between",
      gap: space.md,
      paddingHorizontal: space.base,
      paddingBottom: space.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    counter: { ...type.caption, color: c.textMuted },
    timer: { ...type.captionStrong, color: c.textSecondary, fontVariant: ["tabular-nums"] },

    content: { paddingHorizontal: space.lg, paddingTop: space.lg },
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
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.border,
    },
    optionText: { ...type.body, color: c.text, flex: 1 },

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
    ghost: { height: MIN_TAP, alignItems: "center", justifyContent: "center", marginTop: space.md },
    ghostText: { ...type.body, color: c.textMuted },

    resultWrap: { alignItems: "center", paddingHorizontal: space.lg },
    resultBadge: {
      width: 76,
      height: 76,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space.lg,
    },
    resultScore: { fontSize: 56, lineHeight: 62, fontWeight: "700", fontVariant: ["tabular-nums"] },
    resultHead: { ...type.title, color: c.text, marginTop: space.sm },
    resultSub: {
      ...type.body,
      color: c.textSecondary,
      textAlign: "center",
      marginTop: space.md,
      marginBottom: space.xl,
    },
  });
