import type { ReactNode } from "react";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";

export function SessionMasthead({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  return <View style={styles.masthead}>
    <AppText accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{title}</AppText>
    <Image source={require("../../../../assets/images/sessions/underline.webp")} contentFit="cover" style={styles.underline} accessible={false} />
    <AppText style={[styles.subtitle, compact && styles.compactSubtitle]}>{subtitle}</AppText>
    <Image source={require("../../../../assets/images/sessions/restaurant-hero.webp")} contentFit="cover" style={[styles.hero, compact && styles.compactHero]} accessible={false} />
  </View>;
}

export function SessionPaper({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <View style={styles.paper}>
    <Image source={require("../../../../assets/images/sessions/invitation-paper.webp")} contentFit="fill" style={StyleSheet.absoluteFill} accessible={false} />
    <View style={[styles.paperContent, compact && styles.paperCompact]}>{children}</View>
  </View>;
}

export function SessionSteps({ step }: { step: 0 | 1 | 2 | 3 }) {
  return <View style={styles.steps} accessibilityLabel={`مرحلة ${["الدعوة", "التفضيلات", "التصويت", "النتيجة"][step]}`}>
    {["نجتمع", "ذوقنا", "نصوّت", "طلعتنا"].map((label, i) => <View key={label} style={styles.step}>
      <AppText style={[styles.stepNumber, i <= step && styles.stepActive]}>{(i + 1).toLocaleString("ar-SA")}</AppText>
      <AppText style={[styles.stepLabel, i === step && styles.currentLabel]}>{label}</AppText>
    </View>)}
  </View>;
}

export function HailaTip({ children }: { children: ReactNode }) {
  return <View style={styles.tip}>
    <Image source={require("../../../../assets/images/sessions/haila-gathering.webp")} style={styles.haila} contentFit="contain" accessibilityLabel="هيلة، رفيقة الجلسة" />
    <View style={styles.tipCopy}><AppText style={styles.tipName}>هيلة معكم</AppText><AppText style={styles.tipText}>{children}</AppText></View>
  </View>;
}

const styles = StyleSheet.create({
  compactTitle: { fontSize: 25, lineHeight: 38 },
  compactSubtitle: { fontSize: 13, lineHeight: 23 },
  compactHero: { aspectRatio: 4.2 },
  masthead: { paddingTop: 4 },
  title: { textAlign: "right", writingDirection: "rtl", fontSize: 29, lineHeight: 46, fontFamily: theme.typography.fontFamilyBold, paddingHorizontal: 10 },
  underline: { width: 76, height: 6, alignSelf: "flex-end", marginRight: 26, marginTop: -5, marginBottom: 7 },
  subtitle: { textAlign: "right", writingDirection: "rtl", fontSize: 15, lineHeight: 27, paddingHorizontal: 10, color: "#586348", marginBottom: 10 },
  hero: { width: "100%", aspectRatio: 3.7 },
  paper: { marginTop: -12 },
  paperContent: { paddingHorizontal: 27, paddingTop: 16, paddingBottom: 55, gap: 14 },
  paperCompact: { paddingTop: 12, paddingBottom: 36, gap: 8 },
  steps: { ...layoutDirection("ltr"), flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 10, gap: 4 },
  step: { flex: 1, alignItems: "center", gap: 7 },
  stepNumber: { width: 27, height: 27, borderRadius: 14, overflow: "hidden", textAlign: "center", lineHeight: 27, backgroundColor: "#E9E9DC", color: "#6E7865", fontSize: 13 },
  stepActive: { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary },
  stepLabel: { fontSize: 11, color: "#6E7865", textAlign: "center" }, currentLabel: { color: theme.colors.primary, fontFamily: theme.typography.fontFamilyBold },
  tip: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 6 },
  haila: { width: 58, height: 64 }, tipCopy: { flex: 1, gap: 4 },
  tipName: { textAlign: "right", fontSize: 13, color: "#8C672D", fontFamily: theme.typography.fontFamilyBold },
  tipText: { textAlign: "right", writingDirection: "rtl", fontSize: 14, lineHeight: 25, color: "#586348" },
});
