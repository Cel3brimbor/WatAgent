//keep in sync with UwFacultySchema in the backend (src/shared/appearance-schemas.ts)
export const UW_FACULTIES = [
  { id: "arts", label: "Arts" },
  { id: "engineering", label: "Engineering" },
  { id: "environment", label: "Environment" },
  { id: "health", label: "Health" },
  { id: "mathematics", label: "Mathematics" },
  { id: "science", label: "Science" },
  { id: "other", label: "Other / not sure" },
] as const;

export type UwFaculty = (typeof UW_FACULTIES)[number]["id"];

export function uwFacultyOf(raw: unknown): UwFaculty | null {
  return UW_FACULTIES.find((faculty) => faculty.id === raw)?.id ?? null;
}

export type OnboardingAnswers = {
  isUwaterlooStudent: boolean;
  uwFaculty: UwFaculty | null;
  advancedView: boolean;
};
