import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

// Temporary legacy form; replace its design and behavior with the new account screens in #21.
export function SignUpScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const canContinue = name.length > 0 && phone.length === 10 && phone.startsWith("05");

  return (
    <View style={styles.container}>
      <AppText variant="title" style={styles.title}>انشئ حسابك</AppText>
      <AppText variant="label" style={styles.label}>الاسم</AppText>
      <AppInput
        style={styles.input}
        placeholder="فهد"
        value={name}
        onChangeText={setName}
      />
      <AppText variant="label" style={styles.label}>رقم الجوال</AppText>
      <AppInput
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="05XXXXXXXX"
        value={phone}
        maxLength={10}
        onChangeText={setPhone}
      />
      <AppButton
        title="رمز تحقق"
        style={styles.button}
        disabled={!canContinue}
        // Existing UI placeholder; real SMS/session integration belongs to FE-05 (#21).
        onPress={() => Alert.alert("تم ارسال رمز التحقق")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.pagePadding,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  title: { marginBottom: theme.spacing.titleGap },
  label: { marginBottom: theme.spacing.labelGap },
  input: { marginBottom: theme.spacing.fieldGap },
  button: { marginTop: theme.spacing.actionGap },
});
