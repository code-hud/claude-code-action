#!/usr/bin/env bun

import * as core from "@actions/core";
import {
  isIssuesEvent,
  isIssuesAssignedEvent,
  isIssueCommentEvent,
  isPullRequestEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
} from "../context";
import type { ParsedGitHubContext } from "../context";

export type AIProvider = "claude" | "augment";

export function detectAIProvider(text: string): AIProvider | null {
  // Check for @augment first (more specific)
  const augmentRegex = /(^|\s)@augment([\s.,!?;:]|$)/;
  if (augmentRegex.test(text)) {
    return "augment";
  }
  
  // Check for @claude
  const claudeRegex = /(^|\s)@claude([\s.,!?;:]|$)/;
  if (claudeRegex.test(text)) {
    return "claude";
  }
  
  return null;
}

export function checkContainsTrigger(context: ParsedGitHubContext): { containsTrigger: boolean; aiProvider?: AIProvider } {
  const {
    inputs: { assigneeTrigger, triggerPhrase, directPrompt },
  } = context;

  // If direct prompt is provided, always trigger with claude as default
  if (directPrompt) {
    console.log(`Direct prompt provided, triggering action with Claude`);
    return { containsTrigger: true, aiProvider: "claude" };
  }

  // Check for assignee trigger
  if (isIssuesAssignedEvent(context)) {
    // Remove @ symbol from assignee_trigger if present
    let triggerUser = assigneeTrigger.replace(/^@/, "");
    const assigneeUsername = context.payload.assignee?.login || "";

    if (triggerUser && assigneeUsername === triggerUser) {
      console.log(`Issue assigned to trigger user '${triggerUser}'`);
      return { containsTrigger: true, aiProvider: "claude" }; // Default to claude for assignee triggers
    }
  }

  // Check for issue body and title trigger on issue creation
  if (isIssuesEvent(context) && context.eventAction === "opened") {
    const issueBody = context.payload.issue.body || "";
    const issueTitle = context.payload.issue.title || "";
    
    // Check for AI provider in body
    let aiProvider = detectAIProvider(issueBody);
    if (!aiProvider) {
      aiProvider = detectAIProvider(issueTitle);
    }
    
    if (aiProvider) {
      console.log(`Issue contains ${aiProvider} trigger`);
      return { containsTrigger: true, aiProvider };
    }

    // Fallback to original trigger phrase logic for backward compatibility
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(issueBody)) {
      console.log(
        `Issue body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return { containsTrigger: true, aiProvider: "claude" };
    }

    // Check in title
    if (regex.test(issueTitle)) {
      console.log(
        `Issue title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return { containsTrigger: true, aiProvider: "claude" };
    }
  }

  // Check for pull request body and title trigger
  if (isPullRequestEvent(context)) {
    const prBody = context.payload.pull_request.body || "";
    const prTitle = context.payload.pull_request.title || "";
    
    // Check for AI provider in body
    let aiProvider = detectAIProvider(prBody);
    if (!aiProvider) {
      aiProvider = detectAIProvider(prTitle);
    }
    
    if (aiProvider) {
      console.log(`Pull request contains ${aiProvider} trigger`);
      return { containsTrigger: true, aiProvider };
    }

    // Fallback to original trigger phrase logic for backward compatibility
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(prBody)) {
      console.log(
        `Pull request body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return { containsTrigger: true, aiProvider: "claude" };
    }

    // Check in title
    if (regex.test(prTitle)) {
      console.log(
        `Pull request title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return { containsTrigger: true, aiProvider: "claude" };
    }
  }

  // Check for pull request review body trigger
  if (
    isPullRequestReviewEvent(context) &&
    (context.eventAction === "submitted" || context.eventAction === "edited")
  ) {
    const reviewBody = context.payload.review.body || "";
    
    // Check for AI provider
    const aiProvider = detectAIProvider(reviewBody);
    if (aiProvider) {
      console.log(`Pull request review contains ${aiProvider} trigger`);
      return { containsTrigger: true, aiProvider };
    }

    // Fallback to original trigger phrase logic for backward compatibility
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(reviewBody)) {
      console.log(
        `Pull request review contains exact trigger phrase '${triggerPhrase}'`,
      );
      return { containsTrigger: true, aiProvider: "claude" };
    }
  }

  // Check for comment trigger
  if (
    isIssueCommentEvent(context) ||
    isPullRequestReviewCommentEvent(context)
  ) {
    const commentBody = isIssueCommentEvent(context)
      ? context.payload.comment.body
      : context.payload.comment.body;
      
    // Check for AI provider
    const aiProvider = detectAIProvider(commentBody);
    if (aiProvider) {
      console.log(`Comment contains ${aiProvider} trigger`);
      return { containsTrigger: true, aiProvider };
    }

    // Fallback to original trigger phrase logic for backward compatibility
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(commentBody)) {
      console.log(`Comment contains exact trigger phrase '${triggerPhrase}'`);
      return { containsTrigger: true, aiProvider: "claude" };
    }
  }

  console.log(`No trigger was met for ${triggerPhrase}`);

  return { containsTrigger: false };
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkTriggerAction(context: ParsedGitHubContext) {
  const result = checkContainsTrigger(context);
  core.setOutput("contains_trigger", result.containsTrigger.toString());
  if (result.aiProvider) {
    core.setOutput("ai_provider", result.aiProvider);
  }
  return result.containsTrigger;
}
