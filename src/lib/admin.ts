import { useEffect, useState } from "react";

const KEY = "shopmind_admin";

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const param = url.searchParams.get("admin");
    if (param === "0") {
      localStorage.setItem(KEY, "0");
      setIsAdmin(false);
      return;
    }
    if (param === "1") {
      localStorage.removeItem(KEY);
      setIsAdmin(true);
      return;
    }
    // Default: admin ON unless explicitly disabled
    setIsAdmin(localStorage.getItem(KEY) !== "0");
  }, []);

  return isAdmin;
}
