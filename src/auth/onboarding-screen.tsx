"use client";

import { useState } from "react";
import { UW_FACULTIES, type OnboardingAnswers, type UwFaculty } from "@/auth/onboarding";

type Props = {
  onDone: (answers: OnboardingAnswers) => Promise<void>;
  onSkip: () => Promise<void>;
};

type Step = "student" | "faculty" | "view";

export function OnboardingScreen({ onDone, onSkip }: Props) {
  const [step, setStep] = useState<Step>("student");
  const [student, setStudent] = useState<boolean | null>(null);
  const [faculty, setFaculty] = useState<UwFaculty | "">("");
  const [advanced, setAdvanced] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  //the faculty question is skipped only once they say they are not a UW student
  const steps: Step[] = student === false ? ["student", "view"] : ["student", "faculty", "view"];
  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const ready = step === "student" ? student !== null : step === "faculty" ? faculty !== "" : true;

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

  function next() {
    if (!ready || student === null) return;
    if (!last) {
      setStep(steps[index + 1]);
      return;
    }
    void run(() =>
      onDone({ isUwaterlooStudent: student, uwFaculty: student && faculty ? faculty : null, advancedView: advanced }),
    );
  }

  return (
    <main className="login-shell login-shell--center">
      <form
        className="login-card onboarding-card"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <p className="onboarding-progress" aria-live="polite">
          Question {index + 1} of {steps.length}
        </p>
        {failure ? (
          <p className="login-error" role="alert">
            {failure}
          </p>
        ) : null}

        {step === "student" ? (
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
        ) : null}

        {step === "faculty" ? (
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

        {step === "view" ? (
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
              Advanced adds the Calendars section for merging calendars, rules and the calendar map. You can change this
              later in Settings.
            </p>
          </fieldset>
        ) : null}

        <button type="submit" className="primary-btn login-btn" disabled={!ready || working}>
          {working ? "Saving…" : last ? "Finish" : "Continue"}
        </button>
        {index > 0 ? (
          <button
            type="button"
            className="ghost-btn login-btn"
            disabled={working}
            onClick={() => setStep(steps[index - 1])}
          >
            Back
          </button>
        ) : (
          <button type="button" className="ghost-btn login-btn" disabled={working} onClick={() => void run(onSkip)}>
            Skip for now
          </button>
        )}
      </form>
    </main>
  );
}
