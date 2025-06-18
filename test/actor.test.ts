import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import { checkAllowedActor } from "../src/github/validation/actor";
import type { ParsedGitHubContext } from "../src/github/context";

describe("checkAllowedActor", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const createMockOctokit = (userType: string, userLogin: string) => {
    return {
      users: {
        getByUsername: async () => ({
          data: { type: userType, login: userLogin },
        }),
      },
    } as any;
  };

  const createContext = (
    actor: string,
    allowedBotNames: string[] = [],
  ): ParsedGitHubContext => ({
    runId: "1234567890",
    eventName: "issue_comment",
    eventAction: "created",
    repository: {
      full_name: "test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
    },
    actor,
    payload: {
      action: "created",
      issue: {
        number: 1,
        title: "Test Issue",
        body: "Test body",
        user: { login: "test-user" },
      },
      comment: {
        id: 123,
        body: "@claude test",
        user: { login: actor },
        html_url:
          "https://github.com/test-owner/test-repo/issues/1#issuecomment-123",
      },
    } as any,
    entityNumber: 1,
    isPR: false,
    inputs: {
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      allowedBotNames,
      allowedTools: [],
      disallowedTools: [],
      customInstructions: "",
      directPrompt: "",
    },
  });

  it("should allow human users", async () => {
    const octokit = createMockOctokit("User", "test-user");
    const context = createContext("test-user");

    await expect(checkAllowedActor(octokit, context)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("Actor: test-user, type: User");
    expect(consoleSpy).toHaveBeenCalledWith("Verified human actor: test-user");
  });

  it("should reject bots not in the whitelist", async () => {
    const octokit = createMockOctokit("Bot", "random-bot");
    const context = createContext("random-bot");

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow(
      "Workflow initiated by unauthorized actor: random-bot (type: Bot). Only human users and whitelisted bots are allowed.",
    );
  });

  it("should allow bots in the whitelist", async () => {
    const octokit = createMockOctokit("Bot", "dependabot[bot]");
    const context = createContext("dependabot[bot]", ["dependabot[bot]", "renovate[bot]"]);

    await expect(checkAllowedActor(octokit, context)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("Actor: dependabot[bot], type: Bot");
    expect(consoleSpy).toHaveBeenCalledWith("Verified allowed bot actor: dependabot[bot]");
  });

  it("should reject bots not in the specific whitelist", async () => {
    const octokit = createMockOctokit("Bot", "malicious-bot");
    const context = createContext("malicious-bot", ["dependabot[bot]", "renovate[bot]"]);

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow(
      "Workflow initiated by unauthorized actor: malicious-bot (type: Bot). Only human users and whitelisted bots are allowed. Allowed bots: dependabot[bot], renovate[bot]",
    );
  });

  it("should handle multiple allowed bots", async () => {
    const allowedBots = ["dependabot[bot]", "renovate[bot]", "github-actions[bot]"];
    
    // Test each allowed bot
    for (const botName of allowedBots) {
      const octokit = createMockOctokit("Bot", botName);
      const context = createContext(botName, allowedBots);

      await expect(checkAllowedActor(octokit, context)).resolves.toBeUndefined();
    }
  });

  it("should handle empty whitelist", async () => {
    const octokit = createMockOctokit("Bot", "some-bot");
    const context = createContext("some-bot", []);

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow(
      "Workflow initiated by unauthorized actor: some-bot (type: Bot). Only human users and whitelisted bots are allowed.",
    );
  });

  it("should handle case-sensitive bot names", async () => {
    const octokit = createMockOctokit("Bot", "DependaBot[bot]");
    const context = createContext("DependaBot[bot]", ["dependabot[bot]"]); // different case in whitelist

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow(
      "Workflow initiated by unauthorized actor: DependaBot[bot] (type: Bot). Only human users and whitelisted bots are allowed. Allowed bots: dependabot[bot]",
    );
  });

  it("should throw error when GitHub API fails", async () => {
    const error = new Error("API error");
    const octokit = {
      users: {
        getByUsername: async () => {
          throw error;
        },
      },
    } as any;
    const context = createContext("test-user");

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow("API error");
  });

  it("should call GitHub API with correct username", async () => {
    let capturedUsername: string | undefined;
    const octokit = {
      users: {
        getByUsername: async (params: any) => {
          capturedUsername = params.username;
          return { data: { type: "User", login: "test-user" } };
        },
      },
    } as any;
    const context = createContext("test-user");

    await checkAllowedActor(octokit, context);

    expect(capturedUsername).toBe("test-user");
  });

  it("should reject Organizations even if whitelisted", async () => {
    const octokit = createMockOctokit("Organization", "my-org");
    const context = createContext("my-org", ["my-org"]);

    await expect(checkAllowedActor(octokit, context)).rejects.toThrow(
      "Workflow initiated by unauthorized actor: my-org (type: Organization). Only human users and whitelisted bots are allowed. Allowed bots: my-org",
    );
  });
}); 