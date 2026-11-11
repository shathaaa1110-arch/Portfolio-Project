import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { AppButton, AppText } from "@/shared/components";
import { SessionSheet } from "./SessionChrome";
import { QuietButton, room } from "./SessionLayout";

type Props = {
  organizer: boolean; available: boolean; disabled: boolean; busy: boolean;
  open: boolean; error: string; roundNumber: number;
  onOpen: () => void; onClose: () => void; onConfirm: () => Promise<void>; onRefresh: () => Promise<void>;
};

// Presentation only: the parent validates the current membership/round before any write.
export function SessionRetry(props: Props) {
  if (!props.organizer) return <AppText style={room.center}>إذا بدأ المنظّم جولة جديدة، بتظهر لك هنا لمراجعة ذوقك وتأكيد جاهزيتك.</AppText>;
  return <>
    <View style={styles.action}>
      <QuietButton title="نجرّب جولة ثانية" disabled={props.disabled || !props.available} onPress={props.onOpen} />
      <AppText style={room.center}>{props.available ? "بنفس الطلعة وأهلها، وكل واحد يراجع ذوقه." : "إعادة الجولة غير متاحة حاليًا."}</AppText>
    </View>
    <SessionSheet visible={props.open} title="نعطي جمعتنا فرصة ثانية؟" onClose={props.onClose}>
      <Image source={require("../../../../assets/images/sessions/haila-gathering.webp")} contentFit="contain" style={styles.haila} accessible={false} />
      <AppText style={room.label}>الجولة {(props.roundNumber + 1).toLocaleString("ar-SA")}</AppText>
      <AppText style={room.text}>نفس الدعوة ونفس المشاركين. كل واحد يراجع تفضيلاته ويؤكّد جاهزيته من جديد.</AppText>
      <View style={room.card}>
        <AppText style={room.text}>تفضيلاتكم وحدودكم تبقى محفوظة إلى أن تعدّلونها بأنفسكم.</AppText>
        <AppText style={room.text}>التصويت الجديد يبدأ بدون أصوات الجولة السابقة.</AppText>
      </View>
      {!!props.error && <View><AppText accessibilityRole="alert" style={room.error}>{props.error}</AppText>
        <QuietButton title="تحديث حالة الطلعة" disabled={props.busy} onPress={props.onRefresh} /></View>}
      <AppButton title={props.busy ? "نفتح الجولة الجديدة..." : "نبدأ جولة جديدة"} disabled={props.disabled || !props.available} onPress={props.onConfirm} />
      <QuietButton title="نكمّل على هالجولة" disabled={props.busy} onPress={props.onClose} />
    </SessionSheet>
  </>;
}
const styles = StyleSheet.create({
  action: { gap: 2, paddingVertical: 8 },
  haila: { width: 92, height: 118, alignSelf: "center" },
});
