"use client";

import { useEffect, useState } from "react";

export function ClientBody({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for saved preference
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
      document.body.classList.add("dark");
    }
  }, []);

  return (
    <body className={isDark ? "dark" : ""} suppressHydrationWarning>
      {children}
    </body>
  );
}
