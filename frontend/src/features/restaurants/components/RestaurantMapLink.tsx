import { layoutDirection } from "@/shared/layout";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

type RestaurantMapLinkProps = {
  mapsUrl?: string | null;
  restaurantName: string;
  compact?: boolean;
  variant?: "inline" | "button";
  label?: string;
};

// نتأكد أن الرابط صالح قبل إظهاره.
function getMapUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function RestaurantMapLink({
  mapsUrl,
  restaurantName,
  compact = false,
  variant = "inline",
  label = "الموقع",
}: RestaurantMapLinkProps) {
  const url = getMapUrl(mapsUrl);
  const [opening, setOpening] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  async function openMap() {
    if (!url || opening) return;

    setOpening(true);
    setFailedUrl(null);

    try {
      await Linking.openURL(url);
    } catch {
      setFailedUrl(url);
    } finally {
      setOpening(false);
    }
  }

  if (!url && variant === "button") {
    return (
      <View>
        <Pressable disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
          accessibilityLabel="فتح الخرائط، الموقع غير متوفر" style={[styles.link, styles.button, styles.disabled]}>
          <SymbolView name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" }}
            size={20} tintColor={theme.colors.primary} accessible={false} />
          <AppText style={[styles.label, styles.buttonLabel]}>فتح الخرائط</AppText>
        </Pressable>
        <AppText style={[styles.unavailable, styles.buttonHint]}>الموقع غير متوفر</AppText>
      </View>
    );
  }
  if (!url) {
    if (compact) return <AppText numberOfLines={1} style={[styles.unavailable, styles.compactLabel]}>{label === "الموقع" ? "الموقع غير متوفر" : label}</AppText>;
    return (
      <AppText style={styles.unavailable}>
        الموقع غير متوفر
      </AppText>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`موقع ${restaurantName} على خرائط Google`}
        accessibilityHint="يفتح رابطًا خارج التطبيق"
        accessibilityState={{ disabled: opening, busy: opening }}
        disabled={opening}
        onPress={() => void openMap()}
        style={({ pressed }) => [
          styles.link,
          variant === "button" && [styles.button, styles.primaryButton],
          (pressed || opening) && styles.pressed,
        ]}
      >
        <SymbolView
          name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" }}
          size={compact ? 16 : 20}
          tintColor={variant === "button" ? theme.colors.surface : theme.colors.primary}
          accessible={false}
        />

        <AppText numberOfLines={compact ? 1 : undefined} style={[styles.label, compact && styles.compactLabel, variant === "button" && [styles.buttonLabel, styles.primaryLabel]]}>
          {opening ? "جارٍ الفتح…" : variant === "button" ? "فتح الخرائط" : compact ? label : "الموقع على خرائط Google"}
        </AppText>
      </Pressable>

      {failedUrl === url && (
        <AppText accessibilityRole="alert" style={styles.error}>
          تعذّر فتح الموقع. اضغط الرابط للمحاولة مرة أخرى.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    ...layoutDirection("ltr"),
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    minHeight: theme.sizes.touchTargetMin,
    paddingVertical: 8,
  },
  label: {
    flexShrink: 1,
    color: theme.colors.primary,
    fontFamily: theme.typography.fontFamilyBold,
    textDecorationLine: "underline",
    textAlign: "right",
    writingDirection: "rtl",
  },
  button: { justifyContent: "center", minHeight: 54, borderWidth: 1, borderColor: "#C3CDC0", borderRadius: 28, gap: 8, paddingHorizontal: 20 },
  buttonLabel: { textDecorationLine: "none", fontSize: 15 },
  primaryButton: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  primaryLabel: { color: theme.colors.surface },
  buttonHint: { marginTop: 6, fontSize: 11, textAlign: "center" },
  disabled: { opacity: 0.43 },
  compactLabel: { fontSize: 12, textDecorationLine: "none" },
  unavailable: {
    color: "#626D5E",
    textAlign: "right",
    writingDirection: "rtl",
  },
  error: {
    color: theme.colors.error,
    textAlign: "right",
    writingDirection: "rtl",
  },
  pressed: {
    opacity: 0.65,
  },
});
