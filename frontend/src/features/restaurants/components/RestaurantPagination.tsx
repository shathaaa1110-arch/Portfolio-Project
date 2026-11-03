import { layoutDirection } from "@/shared/layout";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

type RestaurantPaginationProps = {
  pageNumber: number;
  pageCount: number;
  isLoading: boolean;
  error: string | null;
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
};

export function RestaurantPagination(props: RestaurantPaginationProps) {
  const pageLabel =
    props.pageCount > 0
      ? `الصفحة ${props.pageNumber.toLocaleString("ar-SA")} من ${props.pageCount.toLocaleString("ar-SA")}`
      : "لا توجد صفحات";

  return (
    <View style={styles.container}>
      {props.error && (
        <View style={styles.errorPanel}>
          <AppText accessibilityRole="alert" style={styles.errorText}>
            {props.error}
          </AppText>

          <Pressable
            accessibilityRole="button"
            disabled={props.isLoading}
            onPress={props.onRetry}
            style={styles.retry}
          >
            <AppText style={styles.link}>إعادة المحاولة</AppText>
          </Pressable>
        </View>
      )}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الصفحة السابقة"
          accessibilityState={{ disabled: !props.canGoPrevious }}
          disabled={!props.canGoPrevious}
          onPress={props.onPrevious}
          style={({ pressed }) => [
            styles.button,
            !props.canGoPrevious && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <AppText style={styles.buttonText}>السابق</AppText>
        </Pressable>

        <View style={styles.counter} accessibilityLiveRegion="polite">
          <AppText style={styles.centerText}>{pageLabel}</AppText>
          {props.isLoading && (
            <AppText style={styles.loadingText}>جارٍ التحميل…</AppText>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الصفحة التالية"
          accessibilityState={{ disabled: !props.canGoNext }}
          disabled={!props.canGoNext}
          onPress={props.onNext}
          style={({ pressed }) => [
            styles.button,
            styles.next,
            !props.canGoNext && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <AppText style={styles.nextText}>التالي</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
container: {
  flexShrink: 0,
  backgroundColor: theme.colors.background,
  borderTopWidth: 1,
  borderTopColor: theme.colors.border,
  paddingHorizontal: 0,
  paddingVertical: 8,
},
  row: {
    ...layoutDirection("ltr"),
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  button: {
    minWidth: 68,
    minHeight: theme.sizes.touchTargetMin,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.field,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: theme.colors.primary,
    fontFamily: theme.typography.fontFamilyBold,
  },
  next: {
    backgroundColor: theme.colors.primary,
  },
  nextText: {
    color: theme.colors.onPrimary,
    fontFamily: theme.typography.fontFamilyBold,
  },
  counter: {
    flex: 1,
    minHeight: theme.sizes.touchTargetMin,
    justifyContent: "center",
    gap: 2,
  },
  centerText: {
    textAlign: "center",
    writingDirection: "rtl",
  },
  loadingText: {
    color: theme.colors.primary,
    textAlign: "center",
    fontSize: theme.typography.labelSize,
  },
  link: {
    color: theme.colors.primary,
    textAlign: "center",
    textDecorationLine: "underline",
    fontSize: theme.typography.labelSize,
  },
  errorPanel: {
    alignItems: "center",
  },
  errorText: {
    color: theme.colors.error,
    textAlign: "center",
    writingDirection: "rtl",
  },
  retry: {
    minHeight: theme.sizes.touchTargetMin,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: theme.opacity.disabled,
  },
  pressed: {
    opacity: 0.7,
  },
});