import React from "react";

export default function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
  React.useEffect(() => {
    onComplete();
  }, []);
  return null;
}
