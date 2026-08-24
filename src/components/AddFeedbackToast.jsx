import { useEffect, useState } from "react";

export const ADD_FEEDBACK_DURATION_MS = 1800;

function AddFeedbackToast({ token }) {
  const [dismissedToken, setDismissedToken] = useState(0);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDismissedToken(token);
    }, ADD_FEEDBACK_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token]);

  if (!token || token === dismissedToken) {
    return null;
  }

  return (
    <div
      key={token}
      className="addFeedbackToast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span aria-hidden="true">✓</span>
      Ditambahkan
    </div>
  );
}

export default AddFeedbackToast;
