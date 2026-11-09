import { layoutDirection } from "@/shared/layout";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { loadSession } from "@/features/auth";
import {
  LocationPicker, recallLocation, rememberLocation, requestRecommendationLocation, type RecommendationLocation,
} from "@/features/personalSuggestions";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

type Props = { onLocationChange: (location: RecommendationLocation) => void; pickerRequest?: number };

export function HomeLocationBar({ onLocationChange, pickerRequest = 0 }: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);
  useEffect(() => { if (pickerRequest > 0) setPickerVisible(true); }, [pickerRequest]);
  const [name, setName] = useState("");
  const [place, setPlace] = useState("حدّد موقعك");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const active = useRef(true);
  const requesting = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    let current = true;
    setName("");
    void loadSession().then(session => {
      if (!current) return;
      setName(session?.userName?.trim() ?? "");
      // A new Home, for example after saving preferences, continues with the place this account chose.
      const chosen = recallLocation(session?.token ?? null);
      setPlace(chosen?.label ?? "حدّد موقعك");
      onLocationChange(chosen?.location ?? { kind: "none" });
    }).catch(() => { if (current) setName(""); });
    return () => { current = false; };
  }, []));

  // Show the place and keep it for this account, so it survives opening Home again.
  function choose(location: RecommendationLocation, label: string) {
    setPlace(label);
    onLocationChange(location);
    void loadSession().then(session => rememberLocation(session?.token ?? null, { location, label })).catch(() => {});
  }

  async function locate() {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setMessage("");
    setShowSettings(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await requestRecommendationLocation();
      if (!active.current) return;
      if (result.status !== "ready") {
        choose({ kind: "none" }, "حدّد موقعك");
        setShowSettings(result.status === "denied" && !result.canAskAgain && Platform.OS !== "web");
        setMessage(result.status === "denied"
          ? "ما عندنا إذن الموقع. تقدر تكمّل التصفّح بدونه."
          : result.status === "unavailable"
            ? "فعّل خدمات الموقع، ثم جرّب مرة ثانية."
            : "تعذّر تحديد موقعك. اضغط الموقع للمحاولة مرة ثانية.");
        return;
      }
      // الإحداثيات للترشيحات، واسم المدينة للعرض فقط.
      choose(result.location, "موقعي الحالي");
      if (Platform.OS !== "web") {
        const { lat, lon } = result.location;
        const addresses = await Promise.race([
          Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }).catch(() => []),
          new Promise<Location.LocationGeocodedAddress[]>(resolve => {
            timer = setTimeout(() => resolve([]), 4000);
          }),
        ]);
        const address = addresses[0];
        const label = address?.city || address?.district || address?.region;
        if (active.current && label) choose(result.location, label === "Riyadh" ? "الرياض" : label);
      }
    } catch {
      if (active.current) setMessage("تعذّر تحديد موقعك. جرّب مرة ثانية.");
    } finally {
      if (timer) clearTimeout(timer);
      requesting.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <AppText variant="label" numberOfLines={1} style={styles.greeting}>
          {name ? `هلا، ${name} 👋` : "هلا فيك 👋"}
        </AppText>
        <Pressable onPress={() => setPickerVisible(true)} disabled={busy}
          accessibilityRole="button" accessibilityLabel={busy ? "جارٍ تحديد موقعك" : `${place}، تحديد موقعي`}
          accessibilityHint="يفتح اختيار الحي أو استخدام موقع الجهاز للترشيحات"
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.location, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator size="small" color={theme.colors.primary} /> :
            <SymbolView name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" }}
              size={17} tintColor={theme.colors.primary} accessible={false} />}
          <AppText numberOfLines={1} style={styles.place}>{busy ? "نحدّد موقعك…" : place}</AppText>
          <SymbolView name={{ ios: "chevron.down", android: "expand_more", web: "expand_more" }}
            size={11} tintColor={theme.colors.primary} accessible={false} />
        </Pressable>
      </View>
      {!!message && <View style={styles.notice}>
        <AppText accessibilityRole="alert" style={styles.message}>{message}</AppText>
        {showSettings && <Pressable accessibilityRole="button" style={styles.settings}
          onPress={() => void Linking.openSettings().catch(() => setMessage("افتح إعدادات الجهاز واسمح لذوق باستخدام الموقع."))}>
          <AppText style={styles.settingsText}>فتح الإعدادات</AppText>
        </Pressable>}
      </View>}
      <LocationPicker visible={pickerVisible} onClose={() => setPickerVisible(false)}
        onUseCurrentLocation={() => { setPickerVisible(false); void locate(); }}
        onDistrict={district => {
          choose({ kind: "district", districtId: district.id }, district.name_ar);
          setMessage("نحسب المسافة من وسط الحي المختار.");
          setShowSettings(false);
          setPickerVisible(false);
        }}
        onClear={() => {
          choose({ kind: "none" }, "حدّد موقعك");
          setMessage(""); setShowSettings(false); setPickerVisible(false);
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F0F1E6", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E0E4D6" },
  bar: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 20, gap: 16 },
  greeting: { flex: 1, fontSize: 14, lineHeight: 24, textAlign: "right", writingDirection: "rtl" },
  location: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", maxWidth: "50%", minHeight: 44, gap: 6 },
  place: { flexShrink: 1, fontSize: 13, lineHeight: 22, textAlign: "right", writingDirection: "rtl" },
  notice: { paddingHorizontal: 20, paddingBottom: 8 },
  message: { fontSize: 12, lineHeight: 20, textAlign: "right", writingDirection: "rtl" },
  settings: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center" },
  settingsText: { textDecorationLine: "underline", textAlign: "right" },
  pressed: { opacity: 0.65 },
});
