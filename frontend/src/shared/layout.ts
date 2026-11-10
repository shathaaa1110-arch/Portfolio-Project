import { Platform } from "react-native";

// Yoga uses direction; React Native Web maps writingDirection to CSS direction.
// Keep manually ordered rows and plate positions consistent on both platforms.
export function layoutDirection(value: "ltr" | "rtl") {
  return Platform.OS === "web" ? { writingDirection: value } : { direction: value };
}
