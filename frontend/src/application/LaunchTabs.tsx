import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useIntroCompleted } from "@/features/onboarding";
import { theme } from "@/shared/theme";
import { MainTabs } from "./MainTabs";

// Wait before mounting tabs or Home, so first launch does not flash the feed.
export function LaunchTabs() {
  const completed = useIntroCompleted();
  if (completed === null) return <View style={styles.loading}>
    <ActivityIndicator color={theme.colors.primary} accessibilityLabel="نجهّز ذوق" />
  </View>;
  if (!completed) return <Redirect href="/welcome" />;
  return <MainTabs />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
});
