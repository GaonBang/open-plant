import assert from "node:assert/strict";
import test from "node:test";
import { createSpatialIndex, parseWkt } from "../../dist/index.js";

test("parseWkt: parses POLYGON coordinates", () => {
  const parsed = parseWkt("POLYGON ((0 0, 4 0, 4 2, 0 0))");
  assert.deepEqual(parsed, {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 0],
      ],
    ],
  });
});

test("parseWkt: parses MULTIPOLYGON with SRID prefix", () => {
  const parsed = parseWkt("SRID=4326;MULTIPOLYGON (((0 0, 2 0, 2 2, 0 0)), ((10 10, 11 10, 11 11, 10 10)))");
  assert.deepEqual(parsed, {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 0],
        ],
      ],
      [
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 10],
        ],
      ],
    ],
  });
});

test("parseWkt: supports ZM-style payloads by taking xy", () => {
  const parsed = parseWkt("Polygon Z ((0 0 5, 3 0 5, 3 3 5, 0 0 5))");
  assert.deepEqual(parsed, {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 0],
      ],
    ],
  });
});

test("parseWkt: returns null for unsupported or invalid payloads", () => {
  assert.equal(parseWkt("LINESTRING (0 0, 1 1)"), null);
  assert.equal(parseWkt("POLYGON ((0 0, 1 1"), null);
  assert.equal(parseWkt(""), null);
});

test("createSpatialIndex: basic extent queries", () => {
  const index = createSpatialIndex();
  index.load([
    { minX: 0, minY: 0, maxX: 0, maxY: 0, value: "a" },
    { minX: 5, minY: 5, maxX: 5, maxY: 5, value: "b" },
    { minX: 10, minY: 10, maxX: 10, maxY: 10, value: "c" },
  ]);

  const hitA = index.search([-1, -1, 1, 1]).map(item => item.value);
  assert.deepEqual(hitA, ["a"]);

  const hitBC = index.search([4, 4, 12, 12]).map(item => item.value).sort();
  assert.deepEqual(hitBC, ["b", "c"]);
});

test("createSpatialIndex: returns each item once even when bucket-overlapped", () => {
  const index = createSpatialIndex(2);
  index.load([
    { minX: 0, minY: 0, maxX: 100, maxY: 100, value: "cover-all" },
    { minX: 20, minY: 20, maxX: 25, maxY: 25, value: "local" },
  ]);

  const hits = index.search([22, 22, 23, 23]).map(item => item.value).sort();
  assert.deepEqual(hits, ["cover-all", "local"]);
});

test("createSpatialIndex: load replaces previous dataset", () => {
  const index = createSpatialIndex();
  index.load([{ minX: 0, minY: 0, maxX: 1, maxY: 1, value: "old" }]);
  index.load([{ minX: 10, minY: 10, maxX: 11, maxY: 11, value: "new" }]);

  assert.deepEqual(index.search([0, 0, 2, 2]).map(item => item.value), []);
  assert.deepEqual(index.search([9, 9, 12, 12]).map(item => item.value), ["new"]);
});

