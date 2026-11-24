import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";

// Three visual phases, then stop. Scenes never advance without a tap.
export function useIntroMotion(step: number) {
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState !== "background");

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReduced(value);
    }).catch(() => { if (mounted && !changed) setReduced(true); });
    const app = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => { setPhase(0); }, [step]);

  useEffect(() => {
    if (reduced !== false || !active || phase >= 3) return;
    const timer = setTimeout(() => setPhase(value => Math.min(value + 1, 3)), phase === 0 ? 300 : 1800);
    return () => clearTimeout(timer);
  }, [phase, reduced, active]);

  return {
    phase: reduced ? 3 : phase,
    reduced: reduced !== false,
    showAll: () => setPhase(3),
  };
}
