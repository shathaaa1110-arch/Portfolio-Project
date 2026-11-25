import { useState } from "react";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { introImages } from "../content";
import { Reveal } from "./Reveal";

type SceneProps = { phase: number; reduced: boolean; onChoose: () => void };

function HeilaGuide({ message, reduced, phase, left = false }: { message: string; left?: boolean } & Pick<SceneProps, "reduced" | "phase">) {
  return <Reveal visible={phase >= 1} reduced={reduced} style={[styles.guide, left && styles.guideLeft]}>
    <Image source={introImages.heila} style={styles.heila} contentFit="contain" accessible={false} />
    <View style={styles.speech}>
      <AppText style={styles.heilaName}>هيلة</AppText>
      <AppText style={styles.speechText}>{message}</AppText>
    </View>
  </Reveal>;
}

function Wash() {
  return <Image source={introImages.wash} style={styles.wash} contentFit="contain" accessible={false} pointerEvents="none" />;
}

export function DiscoveryScene({ phase, reduced }: SceneProps) {
  return <View style={styles.discovery}>
    <Wash />
    <Reveal visible={phase >= 1} reduced={reduced} style={styles.search}>
      <SymbolView name={{ ios: "magnifyingglass", android: "search", web: "search" }} size={20} tintColor={theme.colors.primary} />
      <AppText style={styles.query}>{phase >= 2 ? "سعودي" : "وش تشتهي؟"}</AppText>
    </Reveal>
    <View style={styles.results}>
      <Reveal visible={phase >= 2} reduced={reduced} style={styles.backCard}>
        <Image source={introImages.italian} style={styles.restaurantPhoto} contentFit="cover" accessible={false} />
        <AppText style={styles.cardTitle}>خيارات أكثر</AppText>
      </Reveal>
      <Reveal visible={phase >= 2} reduced={reduced} style={styles.frontCard}>
        <Image source={introImages.saudi} style={styles.restaurantPhoto} contentFit="cover" accessible={false} />
        <View style={styles.resultCopy}>
          <AppText style={styles.cardTitle}>مطعم سعودي</AppText>
          <View style={styles.metaRow}>
            <SymbolView name={{ ios: "mappin", android: "location_on", web: "location_on" }} size={14} tintColor={theme.colors.placeholder} />
            <AppText style={styles.meta}>الرياض · اكتشف التفاصيل</AppText>
          </View>
        </View>
      </Reveal>
    </View>
    <HeilaGuide left phase={phase} reduced={reduced} message={phase >= 3 ? "لقيت بداية حلوة لطلعتك!" : "أنا هيلة، نكتشف سوا؟"} />
  </View>;
}

export function PreferencesScene({ phase, reduced, onChoose }: SceneProps) {
  const [selected, setSelected] = useState<"saudi" | "italian">("saudi");
  const cuisine = selected === "saudi" ? "سعودي" : "إيطالي";
  return <View style={styles.preferences}>
    <Wash />
    <Reveal visible={phase >= 1} reduced={reduced} style={styles.tastes}>
      {(["saudi", "italian"] as const).map(id => <Pressable key={id} accessibilityRole="button"
        accessibilityLabel={id === "saudi" ? "سعودي" : "إيطالي"}
        accessibilityState={{ selected: phase >= 2 && selected === id }}
        accessibilityHint="جرّب كيف يتغير المثال حسب المطبخ"
        onPress={() => { setSelected(id); onChoose(); }}
        style={({ pressed }) => [styles.taste, phase >= 2 && selected === id && styles.tasteSelected, pressed && styles.pressed]}>
        <Image source={introImages[id]} style={styles.tastePhoto} contentFit="cover" accessible={false} />
        <AppText style={styles.tasteName}>{id === "saudi" ? "سعودي" : "إيطالي"}</AppText>
        {phase >= 2 && selected === id && <View style={styles.check}>
          <SymbolView name={{ ios: "checkmark", android: "check", web: "check" }} size={14} tintColor={theme.colors.onPrimary} accessible={false} />
        </View>}
      </Pressable>)}
    </Reveal>
    <Reveal visible={phase >= 2} reduced={reduced} style={styles.filters}>
      <View style={styles.filter}>
        <SymbolView name={{ ios: "wallet.bifold", android: "account_balance_wallet", web: "account_balance_wallet" }} size={16} tintColor={theme.colors.primary} />
        <AppText style={styles.filterText}>على ميزانيتك</AppText>
      </View>
      <View style={styles.filter}>
        <SymbolView name={{ ios: "mappin", android: "location_on", web: "location_on" }} size={16} tintColor={theme.colors.primary} />
        <AppText style={styles.filterText}>بالمسافة اللي تختارها</AppText>
      </View>
    </Reveal>
    <Reveal visible={phase >= 3} reduced={reduced} style={styles.personalResult}>
      <Image source={introImages[selected]} style={styles.personalPhoto} contentFit="cover" accessible={false} />
      <View style={styles.personalCopy}>
        <AppText style={styles.meta}>اقتراح يناسبك</AppText>
        <AppText style={styles.cardTitle}>مطبخ {cuisine}</AppText>
        <AppText style={styles.reason}>لأنك تحب الأكل {selected === "saudi" ? "السعودي" : "الإيطالي"}</AppText>
      </View>
    </Reveal>
    {/* A separate row grows with the speech, so it never covers the result. */}
    <HeilaGuide phase={phase} reduced={reduced} message={phase >= 3 ? `ذوقك ${cuisine}؟ هذا يناسبك!` : phase >= 2 ? "ونراعي ميزانيتك والمسافة" : "قلّي وش تحب؟"} />
  </View>;
}

export function OutingScene({ phase, reduced }: SceneProps) {
  return <View style={styles.outing}>
    <Wash />
    <View style={styles.inviteRow}>
      <Reveal visible={phase >= 1} reduced={reduced} style={styles.inviteHeila}>
        <Image source={introImages.heila} style={styles.host} contentFit="contain" accessible={false} />
      </Reveal>
      <Reveal visible={phase >= 1} reduced={reduced} style={styles.invitation}>
        {/* Keep the whole illustration visible at its original 1080:360 ratio. */}
        <Image source={introImages.restaurant} style={styles.inviteHero} contentFit="contain" accessible={false} />
        <View style={styles.inviteCopy}>
          <AppText style={styles.inviteEyebrow}>جمعتكم صار لها موعد.</AppText>
          <AppText style={styles.inviteTitle}>عشاء الأصحاب</AppText>
          <AppText style={styles.inviteMeta}>الخميس · ٨:٣٠ مساءً · الرياض</AppText>
          <View style={styles.share}>
            <SymbolView name={{ ios: "square.and.arrow.up", android: "share", web: "share" }} size={18} tintColor={theme.colors.primary} accessible={false} />
          </View>
        </View>
      </Reveal>
    </View>
    <Reveal visible={phase >= 2} reduced={reduced} style={styles.people}>
      {[{ letter: "أ", name: "أنت" }, { letter: "س", name: "سارة" }, { letter: "ع", name: "عمر" }].map((person, i) => <View key={person.name} style={styles.person}>
        <View style={[styles.avatar, { backgroundColor: ["#E4E9D9", "#EACFAA", "#CCDCD2"][i] }]}>
          <AppText style={styles.letter}>{person.letter}</AppText>
          {phase >= 3 && <View style={styles.joined}><SymbolView name={{ ios: "checkmark", android: "check", web: "check" }} size={11} tintColor={theme.colors.onPrimary} /></View>}
        </View>
        <AppText style={styles.personName}>{person.name}</AppText>
      </View>)}
    </Reveal>
    <Reveal visible={phase >= 3} reduced={reduced} style={styles.groupResult}>
      <AppText style={styles.groupText}>تفضيلاتكم، جاهزيتكم، ثم التصويت والنتيجة</AppText>
    </Reveal>
  </View>;
}

const row = { ...layoutDirection("ltr"), flexDirection: "row-reverse" as const };
const styles = StyleSheet.create({
  discovery: { gap: 18, paddingTop: 6 }, preferences: { gap: 16, paddingTop: 6 }, outing: { minHeight: 340, gap: 22, paddingTop: 8 },
  wash: { position: "absolute", width: "120%", height: 310, left: "-10%", top: 35, opacity: 0.9 },
  guide: { ...row, alignItems: "center", gap: 12 },
  guideLeft: { flexDirection: "row" },
  heila: { width: 84, height: 98 },
  speech: { flex: 1, minWidth: 0, padding: 12, backgroundColor: "#FFFDF6", borderWidth: 1, borderColor: "#D4DDC3", borderRadius: 17, borderBottomRightRadius: 4 },
  heilaName: { fontSize: 11, color: "#8A692A", fontFamily: theme.typography.fontFamilyBold, marginBottom: 3 },
  speechText: { fontSize: 14, lineHeight: 23 },
  search: { ...row, alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface },
  query: { fontSize: 16 },
  results: { minHeight: 180, paddingRight: 18 },
  frontCard: { width: "86%", alignSelf: "flex-end", backgroundColor: theme.colors.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  backCard: { position: "absolute", left: 6, top: 12, width: "82%", backgroundColor: theme.colors.surface, borderRadius: 18, overflow: "hidden", opacity: 0.45, borderWidth: 1, borderColor: theme.colors.border },
  restaurantPhoto: { width: "100%", height: 96 }, resultCopy: { paddingHorizontal: 12, paddingVertical: 9, gap: 3 },
  cardTitle: { fontSize: 17, lineHeight: 27, fontFamily: theme.typography.fontFamilyBold },
  metaRow: { ...row, alignItems: "center", gap: 4 }, meta: { fontSize: 12, color: "#6D775E", lineHeight: 21 },
  tastes: { ...row, gap: 10 },
  taste: { flex: 1, minWidth: 0, borderRadius: 17, borderWidth: 2, borderColor: "transparent", overflow: "hidden", backgroundColor: theme.colors.surface },
  tasteSelected: { borderColor: theme.colors.primary }, tastePhoto: { height: 68, width: "100%" },
  tasteName: { fontSize: 15, lineHeight: 24, fontFamily: theme.typography.fontFamilyBold, paddingHorizontal: 12, paddingVertical: 7 },
  check: { position: "absolute", left: 7, top: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 }, filters: { ...row, flexWrap: "wrap", justifyContent: "center", gap: 8 },
  filter: { ...row, minHeight: 42, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#D0D9C4", backgroundColor: "#DFE8CF", borderRadius: 24 },
  filterText: { fontSize: 12, lineHeight: 20 },
  personalResult: { ...row, borderRadius: 17, borderWidth: 1, borderColor: "#C6D4B9", backgroundColor: theme.colors.surface, overflow: "hidden", minHeight: 98 },
  personalPhoto: { width: "32%", alignSelf: "stretch" }, personalCopy: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  reason: { fontSize: 12, lineHeight: 21, color: theme.colors.primary },
  inviteRow: { ...row, alignItems: "center", gap: 8 }, inviteHeila: { width: 64, flexShrink: 0 }, host: { width: "100%", aspectRatio: 92 / 126 },
  // An opaque card keeps the watercolor behind it from showing through its edges.
  invitation: { flex: 1, minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: "#E3DCC9", backgroundColor: theme.colors.background, overflow: "hidden" },
  inviteHero: { width: "100%", aspectRatio: 3 },
  inviteCopy: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, gap: 5 },
  inviteEyebrow: { fontSize: 12, lineHeight: 21 }, inviteTitle: { fontSize: 21, lineHeight: 32, fontFamily: theme.typography.fontFamilyBold },
  inviteMeta: { fontSize: 11, lineHeight: 19, color: theme.colors.placeholder },
  share: { alignSelf: "flex-start", backgroundColor: "#E4C485", borderRadius: 20, width: 38, height: 38, alignItems: "center", justifyContent: "center", marginTop: 3 },
  people: { ...row, justifyContent: "center", gap: 28 }, person: { alignItems: "center", gap: 5 },
  avatar: { borderRadius: 25, width: 48, height: 48, alignItems: "center", justifyContent: "center" }, letter: { fontSize: 21, fontFamily: theme.typography.fontFamilyBold },
  personName: { fontSize: 12, color: "#4F614D" }, joined: { position: "absolute", left: -3, bottom: -2, borderRadius: 10, padding: 3, backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.background },
  groupResult: { padding: 10, borderRadius: 14, backgroundColor: "#E1E9D4" }, groupText: { fontSize: 12, lineHeight: 22, textAlign: "center", color: theme.colors.primary },
});
