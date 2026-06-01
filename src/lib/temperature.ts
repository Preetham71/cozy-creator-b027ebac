import { useEffect, useState } from "react";

const KEY = "shopmind_temperature";
const DEFAULT = 0.6;

export function useTemperature() {
  const [temperature, setTemperatureState] = useState<number>(DEFAULT);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (!Number.isNaN(v)) setTemperatureState(Math.max(0, Math.min(1, v)));
    }
  }, []);

  const setTemperature = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setTemperatureState(clamped);
    if (typeof window !== "undefined") localStorage.setItem(KEY, String(clamped));
  };

  return [temperature, setTemperature] as const;
}
