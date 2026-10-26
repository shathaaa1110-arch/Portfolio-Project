import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";

import { theme } from "@/shared/theme";

export function MainTabs() {
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        // Use our page titles instead of a navigation header.
        headerShown: false,

        // Use brand colors for active and inactive tabs.
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.placeholder,

        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: {
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.labelSize,
        },

        // Let the navigator handle the bottom safe area.
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: theme.borders.control,
        },

        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, size, focused }) => (
            <SymbolView
              name={{
                ios: focused ? "house.fill" : "house",
                android: "home",
                web: "home",
              }}
              tintColor={color}
              size={size}
              accessible={false}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="saved"
        options={{
          title: "المحفوظة",
          tabBarIcon: ({ color, size, focused }) => (
            <SymbolView
              name={{
                ios: focused ? "bookmark.fill" : "bookmark",
                android: "bookmark",
                web: "bookmark",
              }}
              tintColor={color}
              size={size}
              accessible={false}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="account"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, size, focused }) => (
            <SymbolView
              name={{
                ios: focused
                  ? "person.crop.circle.fill"
                  : "person.crop.circle",
                android: "account_circle",
                web: "account_circle",
              }}
              tintColor={color}
              size={size}
              accessible={false}
            />
          ),
        }}
      />
    </Tabs>
  );
}