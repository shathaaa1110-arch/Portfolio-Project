import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { SessionHeader } from "./components/SessionChrome";
import { SessionSteps } from "./components/SessionVisuals";
import { room } from "./components/SessionLayout";

// The screen lives for the actual request and state refresh, never a simulated countdown.
export function SessionGenerating({ name }: { name: string }) {
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
      Animated.timing(float, { toValue: -9, duration: 1000, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(float, { toValue: 0, duration: 1000, useNativeDriver: Platform.OS !== "web" }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [float, reduceMotion]);
  return <SafeAreaView style={room.screen}>
    <View style={room.header}><SessionHeader title="نجهّز اقتراحاتكم" /><SessionSteps step={2} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      <AppText style={styles.session}>{name}</AppText>
      <View style={styles.illustration}>
        <Animated.View style={{ transform: [{ translateY: float }] }}>
          <Image source={require("../../../assets/images/sessions/haila.png")} contentFit="contain" style={styles.haila} accessibilityLabel="هيلة تجهّز اقتراحات الجلسة" />
        </Animated.View>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.copy}>
        <AppText accessibilityRole="header" style={styles.title}>هيلة تجمع أذواقكم.</AppText>
        <AppText style={styles.subtitle}>{"نجهّز مطاعم تناسب جمعتكم،\nونراعي ميزانيتكم والمسافة المناسبة لكم."}</AppText>
      </View>
      <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="جارٍ تجهيز اقتراحات المطاعم" accessibilityValue={{ text: "جارٍ التجهيز" }}>
        <ActivityIndicator color={theme.colors.primary} /><AppText style={room.center}>لحظات وتبدأون التصويت</AppText>
      </View>
      <AppText style={room.center}>بتظهر المطاعم تلقائيًا أول ما تجهز.</AppText>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24, gap: 20 },
  session: { textAlign: "center", fontSize: 14, lineHeight: 24, color: "#536653" },
  illustration: { width: 210, height: 210, alignItems: "center", justifyContent: "center" },
  haila: { width: 210, height: 210 },
  copy: { gap: 8 },
  title: { fontSize: 27, lineHeight: 42, fontFamily: theme.typography.fontFamilyBold, textAlign: "center", writingDirection: "rtl" },
  subtitle: { fontSize: 15, lineHeight: 28, textAlign: "center", writingDirection: "rtl", color: "#536653" },
  loading: { backgroundColor: "#E8ECDC", borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12, gap: 12, flexDirection: "row-reverse", alignItems: "center" },
});
