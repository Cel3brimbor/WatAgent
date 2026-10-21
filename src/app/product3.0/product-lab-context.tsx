"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { SmartTag } from "@/calendar/smart-tags";
import { starterTags } from "./product-lab";

type Lab = {
  tags: SmartTag[];
  setTags: Dispatch<SetStateAction<SmartTag[]>>;
  completed: Record<string, boolean>;
  setCompleted: Dispatch<SetStateAction<Record<string, boolean>>>;
};

const LabContext = createContext<Lab | null>(null);

export function ProductLabProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<SmartTag[]>(starterTags);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  return <LabContext.Provider value={{ tags, setTags, completed, setCompleted }}>{children}</LabContext.Provider>;
}

export function useProductLab(): Lab {
  const value = useContext(LabContext);
  if (!value) throw new Error("Product lab is missing");
  return value;
}
