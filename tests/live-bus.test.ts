import { describe, expect, it } from "vitest";
import { notifyLiveChange, onLiveChange } from "../src/app/live-bus";

/**
 * The whole mechanism the live trace-tap terminal runs on: an OTLP receiver
 * route or a completed import pass calls `notifyLiveChange`, the stream
 * route's subscription is what turns that into a line down the wire. Nothing
 * here touches a database or a socket - that split is the point, and it's
 * what makes this worth testing with neither.
 */
describe("live-bus", () => {
  it("calls every subscriber once per notification", () => {
    const calls: string[] = [];
    const stopA = onLiveChange(() => calls.push("a"));
    const stopB = onLiveChange(() => calls.push("b"));

    notifyLiveChange();

    expect(calls).toEqual(["a", "b"]);
    stopA();
    stopB();
  });

  it("stops calling a listener once it unsubscribes", () => {
    const calls: string[] = [];
    const stop = onLiveChange(() => calls.push("tick"));

    notifyLiveChange();
    stop();
    notifyLiveChange();

    expect(calls).toEqual(["tick"]);
  });

  it("notifying with no subscribers left does nothing, not throw", () => {
    expect(() => notifyLiveChange()).not.toThrow();
  });
});
