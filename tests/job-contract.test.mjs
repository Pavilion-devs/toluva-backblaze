import assert from "node:assert/strict";
import test from "node:test";

import { isCanonicalProtectedTermSubset } from "../lib/job-contract.ts";

test("accepts a canonical segment-scoped protected-term subset", () => {
  const authorized = ["Toluva", "Product name"];

  assert.equal(isCanonicalProtectedTermSubset([], authorized), true);
  assert.equal(
    isCanonicalProtectedTermSubset(["Toluva"], authorized),
    true,
  );
  assert.equal(
    isCanonicalProtectedTermSubset(["Product name"], authorized),
    true,
  );
  assert.equal(
    isCanonicalProtectedTermSubset(
      ["Toluva", "Product name"],
      authorized,
    ),
    true,
  );
});

test("rejects unauthorized, reordered, duplicate, or malformed terms", () => {
  const authorized = ["Toluva", "Product name"];

  assert.equal(
    isCanonicalProtectedTermSubset(["Other"], authorized),
    false,
  );
  assert.equal(
    isCanonicalProtectedTermSubset(
      ["Product name", "Toluva"],
      authorized,
    ),
    false,
  );
  assert.equal(
    isCanonicalProtectedTermSubset(["Toluva", "Toluva"], authorized),
    false,
  );
  assert.equal(isCanonicalProtectedTermSubset("Toluva", authorized), false);
  assert.equal(
    isCanonicalProtectedTermSubset([], ["Toluva", "Toluva"]),
    false,
  );
});
