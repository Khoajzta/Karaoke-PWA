export const countActiveMembers = (members) => Object.entries(members || {})
  .filter(([key, member]) => key !== "_state" && member != null)
  .length;

export const claimEmptyRoomForDeletion = (members) => {
  if (countActiveMembers(members) > 0) return null;
  return { _state: "deleting" };
};
