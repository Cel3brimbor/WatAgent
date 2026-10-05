"use client";

import { useState } from "react";
import { UW_FACULTIES, type OnboardingAnswers, type UwFaculty } from "@/auth/onboarding";

type Props = {
  onDone: (answers: OnboardingAnswers) => Promise<void>;
  onSkip: () => Promise<void>;
};

export function OnboardingScreen({ onDone, onSkip }: Props) {
  const [student, setStudent] = useState<boolean | null>(null);
  const [faculty, setFaculty] = useState<UwFaculty | "">("");
  const [advanced, setAdvanced] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setFailure(null);
    try {
      await action();
    } catch {
      setFailure("Couldn't save that. Please try again.");
      setWorking(false);
    }
  }

  const ready = student !== null && (student === false || faculty !== "");

  return (
    <main className="login-shell login-shell--center">
      <form
        className="login-card onboarding-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || student === null) return;
          void run(() =>
            onDone({ isUwaterlooStudent: student, uwFaculty: student && faculty ? faculty : null, advancedView: advanced }),
          );
        }}
      >
        <h1>Set up WatAgent</h1>
        <p className="login-subtitle">Three quick questions. You can change them later in Settings.</p>
        {failure ? (
          <p className="login-error" role="alert">
            {failure}
          </p>
        ) : null}

        <fieldset className="onboarding-group">
          <legend>Are you a University of Waterloo student?</legend>
          <div className="onboarding-choices">
            <label className={`onboarding-choice${student === true ? " is-selected" : ""}`}>
              <input type="radio" name="uw" checked={student === true} onChange={() => setStudent(true)} />
              Yes
            </label>
            <label className={`onboarding-choice${student === false ? " is-selected" : ""}`}>
              <input type="radio" name="uw" checked={student === false} onChange={() => setStudent(false)} />
              No
            </label>
          </div>
        </fieldset>

        {student ? (
          <div className="onboarding-group">
            <label htmlFor="onboarding-faculty">Which faculty are you in?</label>
            <select
              id="onboarding-faculty"
              value={faculty}
              onChange={(event) => setFaculty(event.target.value as UwFaculty | "")}
            >
              <option value="">Choose a faculty</option>
              {UW_FACULTIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <fieldset className="onboarding-group">
          <legend>Which view do you want?</legend>
          <div className="onboarding-choices">
            <label className={`onboarding-choice${!advanced ? " is-selected" : ""}`}>
              <input type="radio" name="view" checked={!advanced} onChange={() => setAdvanced(false)} />
              Simple
            </label>
            <label className={`onboarding-choice${advanced ? " is-selected" : ""}`}>
              <input type="radio" name="view" checked={advanced} onChange={() => setAdvanced(true)} />
              Advanced
            </label>
          </div>
          <p className="onboarding-hint">
            Advanced adds the Calendars section for merging calendars, rules and the calendar map.
          </p>
        </fieldset>

        <button type="submit" className="primary-btn login-btn" disabled={!ready || working}>
          {working ? "Saving…" : "Continue"}
        </button>
        <button type="button" className="ghost-btn login-btn" disabled={working} onClick={() => void run(onSkip)}>
          Skip for now
        </button>
      </form>
    </main>
  );
}
