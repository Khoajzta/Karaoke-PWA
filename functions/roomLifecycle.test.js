import test from "node:test";
import assert from "node:assert/strict";
import { claimEmptyRoomForDeletion, countActiveMembers } from "./roomLifecycle.js";

test("counts only live member records, not the cleanup marker", () => {
  assert.equal(countActiveMembers({
    host: { uid: "host" },
    guest: { uid: "guest" },
    _state: "deleting"
  }), 2);
});

test("claims an empty room for deletion", () => {
  assert.deepEqual(claimEmptyRoomForDeletion(null), { _state: "deleting" });
  assert.deepEqual(claimEmptyRoomForDeletion({ _state: "deleting" }), { _state: "deleting" });
});

test("refuses cleanup while at least one member remains", () => {
  assert.equal(claimEmptyRoomForDeletion({ host: { uid: "host" } }), null);
});
