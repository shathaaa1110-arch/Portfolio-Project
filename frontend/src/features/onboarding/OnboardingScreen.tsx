import { useEffect, useRef, useState, type ComponentRef } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { AppButton, AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { introSteps } from "./content";
import { DiscoveryScene, OutingScene, PreferencesScene } from "./components/IntroScenes";
import { useIntroMotion } from "./useIntroMotion";

type Props = { onFinish: () => void; finishing?: boolean };

export function OnboardingScreen({ onFinish, finishing = false }: Props) {
  const [step, setStep] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const motion = useIntroMotion(step);
  const current = introSteps[step];
  const Scene = [DiscoveryScene, PreferencesScene, OutingScene][step];

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!finishing) {
        if (step > 0) setStep(value => value - 1);
        else onFinish();
      }
      return true;
    });
    return () => subscription.remove();
  }, [step, onFinish, finishing]);

  return <SafeAreaView style={styles.screen}>
    <ScrollView ref={scroll} style={styles.scrollViewport} contentContainerStyle={styles.scroll}>
      <View style={styles.page}>
        <View style={styles.top}>
          <AppText accessibilityLiveRegion="polite" style={styles.count}>{["١", "٢", "٣"][step]} من ٣</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="تخطّي الجولة وافتح الرئيسية"
            onPress={onFinish} disabled={finishing} style={styles.skip}>
            <AppText style={styles.skipText}>تخطّي</AppText>
          </Pressable>
        </View>
        <Scene key={step} phase={motion.phase} reduced={motion.reduced} onChoose={motion.showAll} />
        <View style={styles.intro}>
          <AppText style={styles.eyebrow}>{current.eyebrow}</AppText>
          <View accessible accessibilityRole="header" accessibilityLabel={current.title} style={styles.heading}>
            <Image source={current.image} style={styles.titleImage} contentFit="contain" accessible={false} />
          </View>
          <AppText style={styles.description}>{current.description}</AppText>
        </View>
      </View>
    </ScrollView>
    {/* Keep navigation in its own row; longer scenes scroll above it. */}
    <View style={styles.footer}>
      <View style={styles.dots} accessibilityRole="tablist" accessibilityLabel="شاشات التعريف">
        {introSteps.map((item, index) => <Pressable key={item.title} accessibilityRole="tab"
          accessibilityLabel={item.title} accessibilityState={{ selected: step === index, disabled: finishing }}
          disabled={finishing} onPress={() => setStep(index)} style={styles.dotButton}>
          <View style={[styles.dot, step === index && styles.activeDot]} />
        </Pressable>)}
      </View>
      <AppButton title={finishing ? "لحظات…" : step === 2 ? "ابدأ الاستكشاف" : "التالي"}
        disabled={finishing} onPress={() => step === 2 ? onFinish() : setStep(value => value + 1)} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scrollViewport: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, alignItems: "center" },
  page: { ...layoutDirection("ltr"), width: "100%", maxWidth: 420, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 14 },
  footer: { ...layoutDirection("ltr"), alignSelf: "center", width: "100%", maxWidth: 420, flexShrink: 0, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 14, backgroundColor: theme.colors.background },
  top: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 8 },
  count: { fontSize: 13, color: "#64705C" }, skip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }, skipText: { fontSize: 14, color: theme.colors.primary },
  intro: { alignItems: "center", marginTop: 14 }, eyebrow: { fontSize: 13, color: "#717B61", textAlign: "center", marginBottom: 6 },
  heading: { width: "100%", maxWidth: 280 }, titleImage: { width: "100%", aspectRatio: 864 / 291 },
  description: { textAlign: "center", fontSize: 15, lineHeight: 28, color: "#53614E", marginTop: 10, marginBottom: 8 },
  dots: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 10 },
  dotButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: "#D1DCBC" }, activeDot: { width: 28, backgroundColor: theme.colors.primary },
});
