import { test, expect } from "bun:test";
import { acquireVoiceAudioFocus, isVoiceAudioFocused, subscribeVoiceAudioFocus } from "../voiceAudioFocus";

test("voice focus releases on completion, supporting overlapping owners and repeated cleanup", () => {
  const states: boolean[] = [];
  const unsubscribe = subscribeVoiceAudioFocus(() => states.push(isVoiceAudioFocused()));
  expect(isVoiceAudioFocused()).toBe(false);
  const releaseFirst = acquireVoiceAudioFocus();
  const releaseSecond = acquireVoiceAudioFocus();
  expect(isVoiceAudioFocused()).toBe(true);
  releaseFirst();
  expect(isVoiceAudioFocused()).toBe(true);
  releaseFirst();
  expect(states.length).toBe(3);
  releaseSecond();
  expect(isVoiceAudioFocused()).toBe(false);
  expect(states).toEqual([true, true, true, false]);
  unsubscribe();
});
