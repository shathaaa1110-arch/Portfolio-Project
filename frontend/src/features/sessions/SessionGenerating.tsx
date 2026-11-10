import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { layoutDirection } from "@/shared/layout";
import { SessionHeader, SessionIcon } from "./components/SessionChrome";
import { SessionSteps } from "./components/SessionVisuals";
import { room } from "./components/SessionLayout";

// The screen lives for the actual request and state refresh, never a simulated countdown.
export function SessionGenerating({ name }: { name: string }) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 780 || fontScale > 1.2;
  const float = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); }).catch(() => {});
    const change = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; change.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) { float.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -6, duration: 1600, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(float, { toValue: 0, duration: 1600, useNativeDriver: Platform.OS !== "web" }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [float, reduceMotion]);
  return <SafeAreaView style={room.screen}>
    <View style={room.header}><SessionHeader title="اقتراحات جمعتكم" /><SessionSteps step={2} /></View>
    <ScrollView style={room.scroll} contentContainerStyle={[styles.content, compact && styles.compactContent]}>
      <View style={styles.scene}>
        <AppText numberOfLines={2} style={styles.session}>{name}</AppText>
        <Animated.View style={[styles.illustration, compact && styles.compactIllustration, { transform: [{ translateY: float }] }]}>
          <Image source={require("../../../assets/images/sessions/haila-gathering.png")} contentFit="contain" style={styles.haila} accessibilityLabel="هيلة بوشاحها الذهبي تحمل خريطة المطاعم" />
        </Animated.View>
        <View accessibilityLiveRegion="polite" style={styles.copy}>
          <AppText accessibilityRole="header" style={styles.title}>هيلة تجمع أذواقكم</AppText>
          <Image source={require("../../../assets/images/sessions/underline.png")} contentFit="fill" style={styles.underline} accessible={false} />
          <AppText style={styles.subtitle}>عشان نلقى المطاعم اللي تناسب جمعتكم.</AppText>
        </View>
      </View>
      <View style={styles.considerations} accessibilityLabel="نراعي أذواقكم وميزانيتكم والمسافة المناسبة لكم">
        {([
          ["taste", "أذواقكم"], ["budget", "ميزانيتكم"], ["location", "المسافة"],
        ] as const).map(([icon, label]) => <View key={icon} style={styles.consideration}>
          <SessionIcon name={icon} size={21} color="#7D692F" />
          <AppText style={styles.considerationLabel}>{label}</AppText>
        </View>)}
      </View>
      <View style={styles.status}>
        <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="جارٍ تجهيز اقتراحات المطاعم" accessibilityValue={{ text: "جارٍ التجهيز" }}>
          <ActivityIndicator color={theme.colors.primary} animating={!reduceMotion} hidesWhenStopped={false} />
          <AppText style={styles.loadingLabel}>نجهّز اقتراحاتكم</AppText>
        </View>
        <AppText style={styles.next}>أول ما تجهز، تظهر لكم وتبدأون التصويت.</AppText>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: 18, paddingBottom: 26, gap: 24 },
  compactContent: { paddingTop: 8, paddingBottom: 18, gap: 18 },
  scene: { alignItems: "center", gap: 12 },
  session: { textAlign: "center", writingDirection: "rtl", fontSize: 13, lineHeight: 23, color: "#63715B" },
  illustration: { width: "100%", height: 272, alignItems: "center", justifyContent: "center" },
  compactIllustration: { height: 220 },
  haila: { width: "100%", height: "100%" },
  copy: { alignItems: "center", gap: 8 },
  title: { fontSize: 27, lineHeight: 42, fontFamily: theme.typography.fontFamilyBold, textAlign: "center", writingDirection: "rtl" },
  underline: { width: 82, height: 6, marginTop: -7, marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 26, textAlign: "center", writingDirection: "rtl", color: "#536653", maxWidth: 295 },
  considerations: { ...layoutDirection("ltr"), flexDirection: "row-reverse", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DEDFCD", paddingVertical: 14, gap: 8 },
  consideration: { flex: 1, alignItems: "center", gap: 6 },
  considerationLabel: { fontSize: 12, lineHeight: 21, textAlign: "center", color: "#536653" },
  status: { alignItems: "center", gap: 6 },
  loading: { ...layoutDirection("ltr"), gap: 9, flexDirection: "row-reverse", alignItems: "center" },
  loadingLabel: { fontSize: 14, lineHeight: 25, fontFamily: theme.typography.fontFamilyBold },
  next: { fontSize: 12, lineHeight: 23, textAlign: "center", writingDirection: "rtl", color: "#63715B" },
});
