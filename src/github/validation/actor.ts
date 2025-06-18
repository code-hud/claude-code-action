#!/usr/bin/env bun

/**
 * Check if the action trigger is from a human actor or an allowed bot
 * Prevents unauthorized automated tools or bots from triggering Claude
 */

import type { Octokit } from "@octokit/rest";
import type { ParsedGitHubContext } from "../context";

export async function checkAllowedActor(
  octokit: Octokit,
  githubContext: ParsedGitHubContext,
) {
  // Fetch user information from GitHub API
  const { data: userData } = await octokit.users.getByUsername({
    username: githubContext.actor,
  });

  const actorType = userData.type;
  const actor = githubContext.actor;

  console.log(`Actor: ${actor}, type: ${actorType}`);

  // Allow human users
  if (actorType === "User") {
    console.log(`Verified human actor: ${actor}`);
    return;
  }

  // Check if the bot is in the allowed bot names list
  const allowedBotNames = githubContext.inputs.allowedBotNames;
  if (actorType === "Bot") {
    if (allowedBotNames.length > 0 && allowedBotNames.includes(actor)) {
      console.log(`Verified allowed bot actor: ${actor}`);
      return;
    }
  }

  // If not a human and not in the allowed bot list, reject
  throw new Error(
    `Workflow initiated by unauthorized actor: ${actor} (type: ${actorType}). ` +
    `Only human users and whitelisted bots are allowed.${allowedBotNames.length > 0 ? ` Allowed bots: ${allowedBotNames.join(', ')}` : ''}`,
  );
}
