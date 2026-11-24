import { useEffect, useRef, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

export function Reveal({ visible, reduced, children, style }: {
  visible: boolean; reduced: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0, duration: reduced ? 0 : 550, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reduced, progress]);
  return <Animated.View style={[style, { opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }]} pointerEvents={visible ? "auto" : "none"}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? "auto" : "no-hide-descendants"}>
    {children}
  </Animated.View>;
}
