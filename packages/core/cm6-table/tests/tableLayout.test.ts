import assert from "node:assert/strict";
import test from "node:test";
import {
  computeColumnHandlePosition,
  computeOutlineBox,
  computeRowHandlePosition,
} from "../src/tableLayout";

test("computes outline box relative to wrapper bounds", () => {
  const box = computeOutlineBox(
    { left: 10, top: 20 },
    { left: 30, top: 60, right: 70, bottom: 100 },
    { left: 20, top: 40, right: 90, bottom: 110 }
  );

  assert.deepEqual(box, {
    left: 10,
    top: 20,
    width: 70,
    height: 70,
  });
});

test("computes column handle position above a header cell", () => {
  const point = computeColumnHandlePosition(
    { left: 10, top: 20 },
    { left: 30, top: 50, width: 40 },
    9
  );

  assert.deepEqual(point, {
    left: 40,
    top: 21,
  });
});

test("computes row handle position beside a body cell", () => {
  const point = computeRowHandlePosition(
    { left: 10, top: 20 },
    { left: 30, top: 50, height: 40 },
    10,
    -1
  );

  assert.deepEqual(point, {
    left: 10,
    top: 49,
  });
});
