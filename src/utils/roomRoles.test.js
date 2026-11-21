import test from "node:test";
import assert from "node:assert/strict";
import { isRoomHost, isRoomOwner } from "./roomRoles.js";

test("the promoted member becomes host from the room record", () => {
  assert.equal(isRoomHost({ userId: "guest-2", hostUid: "guest-2" }), true);
});

test("the current host keeps host rights after adding a co-host", () => {
  assert.equal(isRoomHost({
    userId: "old-host",
    hostUid: "old-host",
    coHosts: { "guest-2": true },
    createdRoomId: "ROOM01",
    currentRoomId: "ROOM01"
  }), true);
});

test("a co-host gets host controls without becoming room owner", () => {
  assert.equal(isRoomHost({
    userId: "guest-2",
    hostUid: "old-host",
    coHosts: { "guest-2": true }
  }), true);
  assert.equal(isRoomOwner({ userId: "guest-2", hostUid: "old-host" }), false);
});

test("removing co-host access leaves the primary host unchanged", () => {
  assert.equal(isRoomHost({ userId: "guest-2", hostUid: "old-host", coHosts: {} }), false);
  assert.equal(isRoomHost({ userId: "old-host", hostUid: "old-host", coHosts: {} }), true);
});

test("the creator remains host while room data is loading", () => {
  assert.equal(isRoomHost({
    userId: "old-host",
    createdRoomId: "ROOM01",
    currentRoomId: "ROOM01"
  }), true);
});

test("a signed-in user without a room is not considered host", () => {
  assert.equal(isRoomHost({ userId: "google-user" }), false);
});
