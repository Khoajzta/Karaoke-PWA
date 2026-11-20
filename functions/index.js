import { onValueDeleted } from "firebase-functions/v2/database";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { claimEmptyRoomForDeletion } from "./roomLifecycle.js";

initializeApp();

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const deleteEmptyRoom = onValueDeleted({
  ref: "/rooms/{roomId}/members/{memberId}",
  region: "us-central1",
  retry: true
}, async (event) => {
  const roomId = event.params.roomId;
  const roomRef = getDatabase().ref(`rooms/${roomId}`);

  // Allow reconnects to restore presence before deciding that a room is empty.
  await wait(2500);

  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists()) return;

  const membersRef = roomRef.child("members");
  const result = await membersRef.transaction((members) => {
    const deletionMarker = claimEmptyRoomForDeletion(members);
    return deletionMarker || undefined;
  });

  // The transaction serializes cleanup with clients joining the room: either
  // the join wins and cleanup aborts, or the deletion marker blocks the join.
  if (result.committed) {
    await roomRef.remove();
    console.info(`Deleted empty karaoke room ${roomId}`);
  }
});
