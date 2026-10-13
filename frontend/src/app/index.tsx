import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, } from "react-native";

export default function Index() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const canContinue = name.length > 0 && phone.length === 10 && phone.startsWith("05");
  return (
    <View style={styles.container}>
      <Text style={styles.title}>انشئ حسابك</Text>
      <Text style={styles.label}>الاسم</Text>
      <TextInput style={styles.input} placeholder="فهد" placeholderTextColor="gray" value={name} onChangeText={setName} />
      <Text style={styles.label}>رقم الجوال</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" placeholderTextColor="gray" placeholder="05XXXXXXXX" value={phone} maxLength={10} onChangeText={setPhone} />
      <Pressable style={[styles.button, !canContinue && styles.buttonDisabled]} disabled={!canContinue} onPress={() => Alert.alert("تم ارسال رمز التحقق")}>
        <Text style={styles.buttonText}>رمز تحقق</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "whitesmoke"
  },
  title: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 28,
  },
  input: {
    textAlign: "right",
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "lightgray",
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
  },
  label: {
    textAlign: "right",
    marginBottom: 8,
    fontSize: 20
  },
  button: {
    backgroundColor: "darkgreen",
    borderRadius: 20,
    padding: 15,
    marginTop: 20,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold"
  },
  buttonDisabled: {
    backgroundColor: "gray"
  },
});