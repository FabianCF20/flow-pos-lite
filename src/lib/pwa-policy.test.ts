import { expect, test } from "vitest";
import { allowAppServiceWorker } from "./pwa-policy";

test("development never caches the module graph", () => {
  expect(allowAppServiceWorker(false, "localhost", false, "")).toBe(false);
});
test("built previews never register the app worker", () => {
  expect(allowAppServiceWorker(true, "id-preview--c47e78cf-6cf3-49bb-8cec-f0bb84102bf4.lovable.app", false, "")).toBe(false);
});
test("published app retains offline registration", () => {
  expect(allowAppServiceWorker(true, "flow-pos-lite.lovable.app", false, "")).toBe(true);
});
test("embedded previews and explicit kill switch refuse registration", () => {
  expect(allowAppServiceWorker(true, "flow-pos-lite.lovable.app", true, "")).toBe(false);
  expect(allowAppServiceWorker(true, "flow-pos-lite.lovable.app", false, "?sw=off")).toBe(false);
});