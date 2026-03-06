import assert from "node:assert/strict";
import test from "node:test";
import { computeRoiPointGroups } from "../../dist/index.js";

const REGIONS = [
  {
    id: "roi-a",
    coordinates: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
  },
];

const POINTS = {
  count: 5,
  positions: new Float32Array([
    1,
    1, // inside
    2,
    2, // inside
    9,
    9, // outside
    3,
    3, // inside
    8,
    8, // outside
  ]),
  paletteIndices: new Uint16Array([1, 1, 2, 3, 4]),
};

test("computeRoiPointGroups: uses all points when drawIndices are not provided", () => {
  const stats = computeRoiPointGroups(POINTS, REGIONS);

  assert.equal(stats.inputPointCount, 5);
  assert.equal(stats.pointsInsideAnyRegion, 3);
  assert.equal(stats.unmatchedPointCount, 2);
  assert.equal(stats.groups.length, 1);
  assert.equal(stats.groups[0].totalCount, 3);
});

test("computeRoiPointGroups: respects drawIndices bridge input", () => {
  const stats = computeRoiPointGroups(
    {
      ...POINTS,
      drawIndices: new Uint32Array([3, 2, 99]), // 99 ignored
    },
    REGIONS
  );

  assert.equal(stats.inputPointCount, 2);
  assert.equal(stats.pointsInsideAnyRegion, 1);
  assert.equal(stats.unmatchedPointCount, 1);
  assert.equal(stats.groups.length, 1);
  assert.equal(stats.groups[0].totalCount, 1);
  assert.equal(stats.groups[0].termCounts[0].paletteIndex, 3);
  assert.equal(stats.groups[0].termCounts[0].count, 1);
});

test("computeRoiPointGroups: excludes points inside polygon holes", () => {
  const stats = computeRoiPointGroups(
    {
      count: 4,
      positions: new Float32Array([
        1, 1, // inside outer
        5, 5, // inside hole
        9, 9, // inside outer
        12, 12, // outside
      ]),
      paletteIndices: new Uint16Array([1, 2, 3, 4]),
    },
    [
      {
        id: "roi-hole",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
          [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
          ],
        ],
      },
    ]
  );

  assert.equal(stats.inputPointCount, 4);
  assert.equal(stats.pointsInsideAnyRegion, 2);
  assert.equal(stats.unmatchedPointCount, 2);
  assert.equal(stats.groups.length, 1);
  assert.equal(stats.groups[0].totalCount, 2);
});

test("computeRoiPointGroups: clamps count by fillModes length", () => {
  const stats = computeRoiPointGroups(
    {
      count: 5,
      positions: new Float32Array([
        1, 1, // inside
        2, 2, // inside
        3, 3, // inside
        9, 9, // outside
        10, 10, // outside
      ]),
      paletteIndices: new Uint16Array([1, 1, 1, 2, 2]),
      fillModes: new Uint8Array([0, 1, 0]), // only first 3 points are valid
    },
    REGIONS
  );

  assert.equal(stats.inputPointCount, 3);
  assert.equal(stats.pointsInsideAnyRegion, 3);
  assert.equal(stats.unmatchedPointCount, 0);
});

test("computeRoiPointGroups: prefers the smallest containing region when regions overlap", () => {
  const stats = computeRoiPointGroups(
    {
      count: 2,
      positions: new Float32Array([
        3, 3, // inside both regions
        8, 8, // inside only large region
      ]),
      paletteIndices: new Uint16Array([5, 6]),
    },
    [
      {
        id: "large",
        coordinates: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      },
      {
        id: "small",
        coordinates: [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
        ],
      },
    ]
  );

  assert.equal(stats.inputPointCount, 2);
  assert.equal(stats.pointsInsideAnyRegion, 2);
  assert.equal(stats.unmatchedPointCount, 0);
  assert.equal(stats.groups.length, 2);

  const groupById = new Map(stats.groups.map(group => [group.regionId, group]));
  assert.equal(groupById.get("large")?.totalCount, 1);
  assert.equal(groupById.get("large")?.termCounts[0]?.paletteIndex, 6);
  assert.equal(groupById.get("small")?.totalCount, 1);
  assert.equal(groupById.get("small")?.termCounts[0]?.paletteIndex, 5);
});
