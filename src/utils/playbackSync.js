export const getFastestPlaybackTarget = ({
  currentServerTime,
  anchorServerTime,
  currentTime,
  videoId,
  seekTrigger = 0,
  peerPositions = {},
  staleAfterMs = 4000
}) => {
  const now = Number.isFinite(currentServerTime) ? currentServerTime : Date.now();
  const anchor = Number.isFinite(anchorServerTime)
    ? Math.max(0, (now - anchorServerTime) / 1000)
    : 0;
  const local = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const positions = Object.values(peerPositions)
    .map((member) => member?.playbackPosition)
    .filter((position) => {
      const age = now - position?.reportedAt;
      return position?.videoId === videoId &&
        (position.seekTrigger || 0) === (seekTrigger || 0) &&
        Number.isFinite(position.seconds) &&
        Number.isFinite(position.reportedAt) &&
        age >= -2000 && age <= staleAfterMs;
    })
    .map((position) => position.seconds + Math.max(0, now - position.reportedAt) / 1000);

  // Taking the local position in the max prevents synchronization from rewinding it.
  return Math.max(anchor, local, ...positions);
};
