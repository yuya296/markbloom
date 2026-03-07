import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { ConnectedRenderQueue } from "../src/renderQueue";

type FrameMap = Map<number, FrameRequestCallback>;

function createFrameScheduler() {
  let nextId = 0;
  const frames: FrameMap = new Map();
  const requestFrame = (callback: FrameRequestCallback): number => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  const cancelFrame = (id: number) => {
    frames.delete(id);
  };
  const flushOne = (): boolean => {
    const first = frames.entries().next();
    if (first.done) {
      return false;
    }
    const [id, callback] = first.value;
    frames.delete(id);
    callback(0);
    return true;
  };
  return { requestFrame, cancelFrame, flushOne, frames };
}

test("retries while wrapper is detached and resumes after reconnect", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const queue = new ConnectedRenderQueue();
  const scheduler = createFrameScheduler();
  const container = dom.window.document.createElement("div");
  const wrapper = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);

  let runCount = 0;
  queue.schedule(container, wrapper, () => {
    runCount += 1;
  }, scheduler);

  assert.equal(runCount, 0);
  assert.equal(scheduler.flushOne(), true);
  assert.equal(runCount, 0, "run should be deferred while wrapper is detached");
  assert.equal(scheduler.frames.size, 1, "next frame should be scheduled");

  dom.window.document.body.appendChild(wrapper);
  assert.equal(scheduler.flushOne(), true);
  assert.equal(runCount, 1, "run should execute after wrapper reconnects");
});

test("stops rescheduling when both wrapper and container are detached", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const queue = new ConnectedRenderQueue();
  const scheduler = createFrameScheduler();
  const container = dom.window.document.createElement("div");
  const wrapper = dom.window.document.createElement("div");

  let runCount = 0;
  queue.schedule(container, wrapper, () => {
    runCount += 1;
  }, scheduler);

  assert.equal(scheduler.flushOne(), true);
  assert.equal(runCount, 0);
  assert.equal(
    scheduler.frames.size,
    0,
    "should stop retry loop when wrapper/container are both disconnected"
  );
});
