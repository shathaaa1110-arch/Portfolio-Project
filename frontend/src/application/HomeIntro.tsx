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
          style={({ pressed }) => [styles.action, selected === "restaurants" && styles.activeAction, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "fork.knife", android: "restaurant", web: "restaurant" }}
            tintColor={selected === "restaurants" ? theme.colors.onPrimary : theme.colors.primary}
            size={27}
            accessible={false}
          />
          <AppText variant="button" style={[styles.actionTitle, selected === "restaurants" && styles.activeTitle]}>ألقى مطعم</AppText>
          <AppText style={[styles.actionHint, selected === "restaurants" && styles.activeHint]}>تصفّح المطاعم لك</AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="أخطّط طلعة، إنشاء جلسة جديدة"
          accessibilityState={{ selected: selected === "outing" }}
          onPress={onCreateSession}
          style={({ pressed }) => [styles.action, selected === "outing" && styles.activeAction, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "map", android: "map", web: "map" }}
            tintColor={selected === "outing" ? theme.colors.onPrimary : theme.colors.primary}
            size={27}
            accessible={false}
          />
          <AppText variant="button" style={[styles.actionTitle, selected === "outing" && styles.activeTitle]}>أخطّط طلعة</AppText>
          <AppText style={[styles.actionHint, selected === "outing" && styles.activeHint]}>اجمع ربعك وصوّتوا</AppText>
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
    gap: 12,
  },

  action: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    minHeight: 96,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },

  // The chosen option stays green, as in the design.
  activeAction: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  activeTitle: {
    color: theme.colors.onPrimary,
  },

  activeHint: {
    color: "#DCE8D6",
  },

  actionTitle: {
    fontSize: 18,
    color: theme.colors.primary,
    writingDirection: "rtl",
  },

  actionHint: {
    fontSize: 14,
    lineHeight: 22,
    color: "#536653",
    textAlign: "center",
    writingDirection: "rtl",
  },

  comingSoon: {
    color: theme.colors.placeholder,
    fontSize: 12,
  },

  pressed: {
    opacity: 0.75,
  },
});
