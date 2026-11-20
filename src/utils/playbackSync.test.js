import test from "node:test";
import assert from "node:assert/strict";
import { getFastestPlaybackTarget } from "./playbackSync.js";

const makePeer = (seconds, reportedAt, overrides = {}) => ({
  playbackPosition: {
    videoId: "video-a",
    seconds,
    reportedAt,
    seekTrigger: 0,
    ...overrides
  }
});

test("uses the furthest recent position across host and members", () => {
  const target = getFastestPlaybackTarget({
    currentServerTime: 200000,
    anchorServerTime: 200000 - 180000,
    currentTime: 180,
    videoId: "video-a",
    peerPositions: { host: makePeer(200, 199000) }
  });

  assert.equal(target, 201);
});

test("does not rewind a device already ahead of the shared anchor", () => {
  const target = getFastestPlaybackTarget({
    currentServerTime: 200000,
    anchorServerTime: 200000 - 180000,
    currentTime: 205,
    videoId: "video-a"
  });

  assert.equal(target, 205);
});

test("ignores stale positions and positions from another video or seek", () => {
  const target = getFastestPlaybackTarget({
    currentServerTime: 200000,
    anchorServerTime: 200000 - 180000,
    currentTime: 180,
    videoId: "video-a",
    seekTrigger: 12,
    peerPositions: {
      stale: makePeer(240, 190000, { seekTrigger: 12 }),
      otherVideo: makePeer(230, 199500, { videoId: "video-b", seekTrigger: 12 }),
      priorSeek: makePeer(220, 199500, { seekTrigger: 11 })
    }
  });

  assert.equal(target, 180);
});

test("projects a recent peer position forward using server time", () => {
  const target = getFastestPlaybackTarget({
    currentServerTime: 202500,
    anchorServerTime: 200000,
    currentTime: 180,
    videoId: "video-a",
    peerPositions: { member: makePeer(202, 202000) }
  });

  assert.equal(target, 202.5);
});
