import { expect, test } from "vitest";
import { allowAppServiceWorker } from "./pwa-policy";

test("development never caches the module graph", () => {
  expect(allowAppServiceWorker(false, "localhost", false, "")).toBe(false);
});
test("built previews never register the app worker", () => {
  expect(
    allowAppServiceWorker(
      true,
      "id-preview--c47e78cf-6cf3-49bb-8cec-f0bb84102bf4.example.com",
      false,
      "",
    ),
  ).toBe(false);
});
test("published app retains offline registration", () => {
  expect(allowAppServiceWorker(true, "app.example.com", false, "")).toBe(true);
});
test("embedded previews and explicit kill switch refuse registration", () => {
  expect(allowAppServiceWorker(true, "app.example.com", true, "")).toBe(false);
  expect(allowAppServiceWorker(true, "app.example.com", false, "?sw=off")).toBe(false);
});
