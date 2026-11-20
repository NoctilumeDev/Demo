import { describe, expect, it } from "vitest";

import { initialCareer } from "../src/game/achievements";
import { loadCareer, saveCareer, type KeyValueStorage } from "../src/game/storage";

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("career storage", () => {
  it("falls back to project history when stored data is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem("eye-opener:career:v1", "not-json");
    expect(loadCareer(storage)).toEqual(initialCareer());
  });

  it("round-trips a valid career", () => {
    const storage = new MemoryStorage();
    const career = initialCareer();
    saveCareer(storage, career);
    expect(loadCareer(storage)).toEqual(career);
  });
});
