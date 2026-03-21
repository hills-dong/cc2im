import { describe, it, expect } from "vitest";
import { DiscordAdapter } from "../src/adapters/discord.js";

describe("DiscordAdapter", () => {
  it("can be instantiated with a token", () => {
    const adapter = new DiscordAdapter("fake-token");
    expect(adapter.platform).toBe("discord");
  });
});
