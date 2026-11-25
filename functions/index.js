import { onValueCreated, onValueDeleted } from "firebase-functions/v2/database";
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

export const advanceRoomFromRequest = onValueCreated({
  ref: "/rooms/{roomId}/advanceRequests/{requestId}",
  region: "us-central1",
  retry: true
}, async (event) => {
  const roomId = event.params.roomId;
  const request = event.data.val();
  const roomRef = getDatabase().ref(`rooms/${roomId}`);

  if (typeof request?.videoId !== "string" || !request?.requestedBy) {
    await event.data.ref.remove();
    return;
  }

  await roomRef.transaction((room) => {
    const playback = room?.playback;
    const expectedVideoId = request.videoId === "__none__" ? null : request.videoId;
    if (!playback || (playback.videoId ?? null) !== expectedVideoId) return;

    const requesterIsHost = playback && (
      room.info?.hostUid === request.requestedBy ||
      room.info?.coHosts?.[request.requestedBy] === true
    );
    if (!requesterIsHost && (!room.members?.[request.requestedBy] || playback.state !== "playing")) return;

    const nextEntry = Object.entries(room.queue || {})
      .sort(([, a], [, b]) => (a?.order || 0) - (b?.order || 0))[0];

    if (nextEntry) {
      const [nextId, nextSong] = nextEntry;
      const queue = { ...(room.queue || {}) };
      delete queue[nextId];
      const nextRoom = {
        ...room,
        playback: {
          ...playback,
          videoId: nextSong.videoId,
          title: nextSong.title,
          state: "playing",
          anchorServerTime: Date.now() + 3000,
          pausedAt: 0
        }
      };
      if (Object.keys(queue).length) nextRoom.queue = queue;
      else delete nextRoom.queue;
      return nextRoom;
    }

    return {
      ...room,
      playback: {
        ...playback,
        state: "paused",
        pausedAt: typeof request.endedAt === "number"
          ? request.endedAt
          : playback.pausedAt || 0
      }
    };
  });

  await event.data.ref.remove();
});
