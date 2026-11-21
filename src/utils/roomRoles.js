export const isRoomOwner = ({ userId, hostUid, createdRoomId, currentRoomId }) => {
  if (!userId) return false;
  if (hostUid) return userId === hostUid;
  return Boolean(createdRoomId && currentRoomId && createdRoomId === currentRoomId);
};

export const isRoomHost = ({ userId, hostUid, coHosts, createdRoomId, currentRoomId }) => {
  if (!userId) return false;
  return userId === hostUid || Boolean(coHosts?.[userId]) ||
    (!hostUid && Boolean(createdRoomId && currentRoomId && createdRoomId === currentRoomId));
};
