import { layoutDirection } from "@/shared/layout";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

type HomeIntroProps = {
  selected: "restaurants" | "outing";
  onFindRestaurant: () => void;
  onCreateSession: () => void;
};

export function HomeIntro({ selected, onFindRestaurant, onCreateSession }: HomeIntroProps) {
  return (
    <View style={styles.container}>
     <View style={styles.hero}>
  <Image
    source={require("../../assets/images/home/thouq-watercolor-wash-v1.png")}
    style={[StyleSheet.absoluteFill, styles.watercolor]}
    contentFit="contain"
    accessible={false}
  />

  <Image
    source={require("../../assets/images/home/thouq-guide-lettering-v1.png")}
    style={styles.lettering}
    contentFit="cover"
    accessible
    accessibilityRole="header"
    accessibilityLabel="ذوق يدلّك"
  />

  <AppText style={styles.description}>
    مطعم تحبّه، وطلعة تستاهل.
  </AppText>
</View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ألقى مطعم، تصفّح قائمة المطاعم"
          accessibilityState={{ selected: selected === "restaurants" }}
          onPress={onFindRestaurant}
          style={({ pressed }) => [
            styles.action,
            selected === "restaurants" ? styles.activeAction : styles.outingAction,
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="button" style={[styles.findText, { color: selected === "restaurants" ? theme.colors.onPrimary : theme.colors.primary }]}>
            ألقى مطعم
          </AppText>

          <SymbolView
            name={{
              ios: "fork.knife",
              android: "restaurant",
              web: "restaurant",
            }}
            tintColor={selected === "restaurants" ? theme.colors.onPrimary : theme.colors.primary}
            size={27}
            accessible={false}
          />
        </Pressable>

        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel="أخطّط طلعة، إنشاء جلسة جديدة"
          accessibilityState={{ selected: selected === "outing" }}
          onPress={onCreateSession}
          style={({ pressed }) => [styles.action, selected === "outing" ? styles.activeAction : styles.outingAction, pressed && styles.pressed]}
        >
          <View style={styles.outingCopy}>
            <AppText variant="label" style={[styles.outingText, { color: selected === "outing" ? theme.colors.onPrimary : theme.colors.primary }]}>
              أخطّط طلعة
            </AppText>

          </View>

          <SymbolView
            name={{
              ios: "map",
              android: "map",
              web: "map",
            }}
            tintColor={selected === "outing" ? theme.colors.onPrimary : theme.colors.primary}
            size={27}
            accessible={false}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },

hero: {
  alignItems: "stretch",
  gap: 0,
  marginHorizontal: -12,
  marginTop: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
},

watercolor: {
  opacity: 0.65,
},

lettering: {
  width: "100%",
  aspectRatio: 1983 / 570,
},

description: {
  textAlign: "center",
  writingDirection: "rtl",
  color: theme.colors.primary,
  fontSize: 15,
  lineHeight: 24,
},

  actions: {
    ...layoutDirection("ltr"),
    flexDirection: "row-reverse",
    gap: 0,
    backgroundColor: theme.colors.searchBackground,
    borderRadius: 20,
  },

  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 20,
  },

  activeAction: {
    backgroundColor: theme.colors.primary,
  },

  findText: {
    fontSize: 18,
    flexShrink: 1,
    writingDirection: "rtl",
  },

  outingAction: {
    backgroundColor: theme.colors.searchBackground,
  },

  outingCopy: {
    flexShrink: 1,
    alignItems: "center",
  },

  outingText: {
    textAlign: "center",
    writingDirection: "rtl",
    fontSize: 17,
  },

  comingSoon: {
    color: theme.colors.placeholder,
    fontSize: 12,
  },

  pressed: {
    opacity: 0.75,
  },
});
