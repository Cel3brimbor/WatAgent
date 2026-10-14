"use client";

import { useEffect, useState } from "react";
import { lockdownActive, subscribeLockdown } from "@/shared/lockdown";

export function LockdownBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(lockdownActive());
    return subscribeLockdown(setOn);
  }, []);
  if (!on) return null;
  return (
    <div className="calendar-notice" role="status" data-state="open">
      <div className="calendar-notice-inner">
        <span>API lockdown. Calendar and chat changes stay on this device until the API opens again.</span>
      </div>
    </div>
  );
}
