import { useEffect, useState } from "react";

export const RESTORE_FEEDBACK_DURATION_MS = 3200;

function RestoreFeedbackToast({ token, message, alert = false }) {
  const [dismissedToken, setDismissedToken] = useState(0);

  useEffect(() => {
    if (!token || !message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDismissedToken(token);
    }, RESTORE_FEEDBACK_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token, message]);

  if (!token || !message || token === dismissedToken) {
    return null;
  }

  return (
    <div
      key={token}
      className="addFeedbackToast restoreFeedbackToast"
      role={alert ? "alert" : "status"}
      aria-live={alert ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}

export default RestoreFeedbackToast;
