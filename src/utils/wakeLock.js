let wakeLockInstance = null;

export const requestWakeLock = async () => {
  if ("wakeLock" in navigator) {
    try {
      wakeLockInstance = await navigator.wakeLock.request("screen");
      console.log("Screen Wake Lock active");

      wakeLockInstance.addEventListener("release", () => {
        console.log("Screen Wake Lock released");
      });

      // Re-acquire on tab visibility change
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return true;
    } catch (err) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
      return false;
    }
  } else {
    console.warn("Screen Wake Lock API not supported on this browser");
    return false;
  }
};

const handleVisibilityChange = async () => {
  if (wakeLockInstance !== null && document.visibilityState === "visible") {
    try {
      wakeLockInstance = await navigator.wakeLock.request("screen");
      console.log("Screen Wake Lock re-acquired");
    } catch (err) {
      console.warn("Failed to re-acquire wake lock:", err);
    }
  }
};

export const releaseWakeLock = () => {
  if (wakeLockInstance !== null) {
    wakeLockInstance.release().catch(console.warn);
    wakeLockInstance = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
};
