"use client";

import { createContext, useContext } from "react";
import { FULL_PERMISSIONS, type CoachPermissions } from "@/lib/coach-permissions";

// Set once by the coach layout (server-side, from the signed-in coach's
// row + org settings) via CoachShell. Hides buttons a coach isn't
// allowed to use - the actual enforcement is server/DB-side (0134).
const CoachPermissionsContext = createContext<CoachPermissions>(FULL_PERMISSIONS);

export const CoachPermissionsProvider = CoachPermissionsContext.Provider;

export function useCoachPermissions(): CoachPermissions {
  return useContext(CoachPermissionsContext);
}
