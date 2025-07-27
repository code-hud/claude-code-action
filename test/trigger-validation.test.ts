#!/usr/bin/env bun

import { describe, it, expect } from "bun:test";
import {
  checkContainsTrigger,
  escapeRegExp,
  detectAIProvider,
} from "../src/github/validation/trigger";
import type { ParsedGitHubContext } from "../src/github/context";
import {
  mockIssueAssignedContext,
  mockIssueOpenedContext,
  mockIssueCommentContext,
  mockPullRequestReviewCommentContext,
  mockPullRequestReviewContext,
  createMockContext,
} from "./mockContext";

describe("checkContainsTrigger", () => {
  describe("direct prompt trigger", () => {
    it("should return true when direct prompt is provided", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "help me with this",
          allowedBotNames: [],
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return false when direct prompt is empty", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedBotNames: [],
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });
  });

  describe("assignee trigger", () => {
    it("should return true when issue is assigned to the trigger user", () => {
      const context = mockIssueAssignedContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should add @ symbol from assignee trigger", () => {
      const context = {
        ...mockIssueAssignedContext,
        inputs: {
          ...mockIssueAssignedContext.inputs,
          assigneeTrigger: "claude-bot",
        },
      };
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return false when issue is assigned to a different user", () => {
      const context = {
        ...mockIssueAssignedContext,
        payload: {
          ...mockIssueAssignedContext.payload,
          assignee: {
            ...(mockIssueAssignedContext.payload as any).assignee,
            login: "different-user",
          },
        },
      } as ParsedGitHubContext;

      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });
  });

  describe("issue body and title trigger", () => {
    it("should return true when issue body contains trigger phrase", () => {
      const context = mockIssueOpenedContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return true when issue title contains trigger phrase", () => {
      const context = {
        ...mockIssueOpenedContext,
        payload: {
          ...mockIssueOpenedContext.payload,
          issue: {
            ...(mockIssueOpenedContext.payload as any).issue,
            title: "/claude Fix the login bug",
            body: "The login page is broken",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should handle trigger phrase with punctuation", () => {
      const baseContext = mockIssueOpenedContext;
      const testCases = [
        { issueBody: "@claude, can you help?", expected: true },
        { issueBody: "@claude. Please look at this", expected: true },
        { issueBody: "@claude! This is urgent", expected: true },
        { issueBody: "@claude? What do you think?", expected: true },
        { issueBody: "@claude: here's the issue", expected: true },
        { issueBody: "@claude; and another thing", expected: true },
        { issueBody: "Hey @claude, can you help?", expected: true },
        { issueBody: "@claudette helped me", expected: false },
        { issueBody: "email@claude.com", expected: false },
      ];

      testCases.forEach(({ issueBody, expected }) => {
        const context = {
          ...baseContext,
          inputs: { ...baseContext.inputs, triggerPhrase: "@claude" },
          payload: {
            ...baseContext.payload,
            issue: {
              ...(baseContext.payload as any).issue,
              body: issueBody,
            },
          },
        } as ParsedGitHubContext;
        const result = checkContainsTrigger(context);
        expect(result.containsTrigger).toBe(expected);
        if (expected) {
          expect(result.aiProvider).toBe("claude");
        }
      });
    });

    it("should return false when trigger phrase is part of another word", () => {
      const context = {
        ...mockIssueOpenedContext,
        payload: {
          ...mockIssueOpenedContext.payload,
          issue: {
            ...(mockIssueOpenedContext.payload as any).issue,
            body: "claudette helped me with this",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });

    it("should handle trigger phrase in title with punctuation", () => {
      const baseContext = mockIssueOpenedContext;
      const testCases = [
        { issueTitle: "@claude, can you help?", expected: true },
        { issueTitle: "@claude: Fix this bug", expected: true },
        { issueTitle: "Bug: @claude please review", expected: true },
        { issueTitle: "email@claude.com issue", expected: false },
      ];

      testCases.forEach(({ issueTitle, expected }) => {
        const context = {
          ...baseContext,
          inputs: { ...baseContext.inputs, triggerPhrase: "@claude" },
          payload: {
            ...baseContext.payload,
            issue: {
              ...(baseContext.payload as any).issue,
              title: issueTitle,
              body: "No trigger in body",
            },
          },
        } as ParsedGitHubContext;
        const result = checkContainsTrigger(context);
        expect(result.containsTrigger).toBe(expected);
        if (expected) {
          expect(result.aiProvider).toBe("claude");
        }
      });
    });
  });

  describe("pull request body and title trigger", () => {
    it("should return true when PR body contains trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedBotNames: [],
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return true when PR title contains trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        payload: {
          pull_request: {
            title: "/claude Review this PR",
            body: "This PR needs review",
            number: 1,
            head: { sha: "abc123" },
            base: { sha: "def456" },
          },
        },
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedBotNames: [],
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return false when PR body doesn't contain trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        payload: {
          pull_request: {
            title: "Fix bug",
            body: "This fixes a bug",
            number: 1,
            head: { sha: "abc123" },
            base: { sha: "def456" },
          },
        },
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedBotNames: [],
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });
  });

  describe("comment trigger", () => {
    it("should return true for issue_comment with trigger phrase", () => {
      const context = mockIssueCommentContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return true for pull_request_review_comment with trigger phrase", () => {
      const context = mockPullRequestReviewCommentContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return true for pull_request_review with submitted action and trigger phrase", () => {
      const context = mockPullRequestReviewContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return true for pull_request_review with edited action and trigger phrase", () => {
      const context = {
        ...mockPullRequestReviewContext,
        payload: {
          ...mockPullRequestReviewContext.payload,
          action: "edited",
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("claude");
    });

    it("should return false for pull_request_review with different action", () => {
      const context = {
        ...mockPullRequestReviewContext,
        payload: {
          ...mockPullRequestReviewContext.payload,
          review: {
            ...(mockPullRequestReviewContext.payload as any)
              .review,
            body: "/claude please review this PR",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });

    it("should handle pull_request_review with punctuation", () => {
      const baseContext = mockPullRequestReviewContext;
      const testCases = [
        { commentBody: "@claude, please review", expected: true },
        { commentBody: "@claude. fix this", expected: true },
        { commentBody: "@claude!", expected: true },
      ];

      testCases.forEach(({ commentBody, expected }) => {
        const context = {
          ...baseContext,
          inputs: { ...baseContext.inputs, triggerPhrase: "@claude" },
          payload: {
            ...baseContext.payload,
            review: {
              ...(baseContext.payload as any).review,
              body: commentBody,
            },
          },
        } as ParsedGitHubContext;
        const result = checkContainsTrigger(context);
        expect(result.containsTrigger).toBe(expected);
        if (expected) {
          expect(result.aiProvider).toBe("claude");
        }
      });
    });

    it("should handle comment trigger with punctuation", () => {
      const baseContext = mockIssueCommentContext;
      const testCases = [
        { commentBody: "@claude, please review", expected: true },
        { commentBody: "@claude. fix this", expected: true },
      ];

      testCases.forEach(({ commentBody, expected }) => {
        const context = {
          ...baseContext,
          inputs: { ...baseContext.inputs, triggerPhrase: "@claude" },
          payload: {
            ...baseContext.payload,
            comment: {
              ...(baseContext.payload as any).comment,
              body: commentBody,
            },
          },
        } as ParsedGitHubContext;
        const result = checkContainsTrigger(context);
        expect(result.containsTrigger).toBe(expected);
        if (expected) {
          expect(result.aiProvider).toBe("claude");
        }
      });
    });
  });

  describe("non-matching events", () => {
    it("should return false for non-matching event type", () => {
      const context = createMockContext({
        eventName: "push",
        eventAction: "created",
        payload: {} as any,
      });
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(false);
    });
  });

  describe("Augment AI provider detection", () => {
    it("should detect @augment in issue body", () => {
      const context = {
        ...mockIssueOpenedContext,
        payload: {
          ...mockIssueOpenedContext.payload,
          issue: {
            ...(mockIssueOpenedContext.payload as any).issue,
            body: "@augment Can you help with this?",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("augment");
    });

    it("should detect @augment in comment", () => {
      const context = {
        ...mockIssueCommentContext,
        payload: {
          ...mockIssueCommentContext.payload,
          comment: {
            ...(mockIssueCommentContext.payload as any).comment,
            body: "@augment please review this code",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("augment");
    });

    it("should prefer @augment over @claude when both are present", () => {
      const context = {
        ...mockIssueCommentContext,
        payload: {
          ...mockIssueCommentContext.payload,
          comment: {
            ...(mockIssueCommentContext.payload as any).comment,
            body: "@claude and @augment please help",
          },
        },
      } as ParsedGitHubContext;
      const result = checkContainsTrigger(context);
      expect(result.containsTrigger).toBe(true);
      expect(result.aiProvider).toBe("augment");
    });
  });
});

describe("detectAIProvider", () => {
  it("should detect @claude", () => {
    expect(detectAIProvider("@claude help me")).toBe("claude");
    expect(detectAIProvider("Hey @claude, can you help?")).toBe("claude");
    expect(detectAIProvider("@claude.")).toBe("claude");
  });

  it("should detect @augment", () => {
    expect(detectAIProvider("@augment help me")).toBe("augment");
    expect(detectAIProvider("Hey @augment, can you help?")).toBe("augment");
    expect(detectAIProvider("@augment.")).toBe("augment");
  });

  it("should prefer @augment over @claude", () => {
    expect(detectAIProvider("@claude and @augment help")).toBe("augment");
    expect(detectAIProvider("@augment or @claude help")).toBe("augment");
  });

  it("should return null for no matches", () => {
    expect(detectAIProvider("help me")).toBe(null);
    expect(detectAIProvider("claudette helped")).toBe(null);
    expect(detectAIProvider("augmented reality")).toBe(null);
  });
});

describe("escapeRegExp", () => {
  it("should escape special regex characters", () => {
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    );
  });

  it("should not escape regular characters", () => {
    expect(escapeRegExp("hello")).toBe("hello");
  });

  it("should handle mixed characters", () => {
    expect(escapeRegExp("hello.*world")).toBe("hello\\.\\*world");
  });
});
