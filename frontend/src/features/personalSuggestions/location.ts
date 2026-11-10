import * as Location from "expo-location";
import { Platform } from "react-native";
import type { RecommendationLocation } from "./types";

export type LocationResult =
  | {
      status: "ready";
      location: Extract<RecommendationLocation, { kind: "coordinates" }>;
    }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "unavailable" | "timeout" | "error" };

const LOCATION_TIMEOUT_MS = 20_000;

function coordinatesResult(lat: number, lon: number): LocationResult {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return { status: "error" };
  }

  return { status: "ready", location: { kind: "coordinates", lat, lon } };
}

// المتصفح يطلب الإذن ضمن طلب الموقع نفسه.
async function requestWebLocation(): Promise<LocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "unavailable" };
  }

  try {
    return await new Promise<LocationResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          resolve(coordinatesResult(coords.latitude, coords.longitude));
        },
        (error) => {
          if (error.code === 1) {
            resolve({ status: "denied", canAskAgain: false });
          } else if (error.code === 3) {
            resolve({ status: "timeout" });
          } else {
            resolve({ status: "unavailable" });
          }
        },
        {
          enableHighAccuracy: false,
          maximumAge: 0,
          timeout: LOCATION_TIMEOUT_MS,
        },
      );
    });
  } catch {
    return { status: "error" };
  }
}

// نستدعي هذه الدالة عندما يضغط المستخدم «استخدم موقعي».
export async function requestRecommendationLocation(): Promise<LocationResult> {
  if (Platform.OS === "web") return requestWebLocation();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error("LOCATION_TIMEOUT");

  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return { status: "unavailable" };

    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { status: "denied", canAskAgain: permission.canAskAgain };
    }

    // نحدد مدة انتظار القراءة بعد منح الإذن.
    const position = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), LOCATION_TIMEOUT_MS);
      }),
    ]);

    return coordinatesResult(
      position.coords.latitude,
      position.coords.longitude,
    );
  } catch (error) {
    return { status: error === timeoutError ? "timeout" : "error" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}