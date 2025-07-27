#!/usr/bin/env bun

/**
 * Augment CLI entrypoint - handles calling Augment and posting response back to GitHub
 */

import { exec } from "child_process";
import { promisify } from "util";
import { createOctokit } from "../github/api/client";
import { updateClaudeComment } from "../github/operations/comments/update-claude-comment";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const execAsync = promisify(exec);

async function run() {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const augmentApiKey = process.env.AUGMENT_API_KEY;
    const instructionFile = process.env.INSTRUCTION_FILE;
    const claudeCommentId = process.env.CLAUDE_COMMENT_ID;
    const repository = process.env.REPOSITORY;
    const triggerUsername = process.env.TRIGGER_USERNAME;

    if (!githubToken) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    if (!augmentApiKey) {
      throw new Error("AUGMENT_API_KEY environment variable is required");
    }
    if (!instructionFile) {
      throw new Error("INSTRUCTION_FILE environment variable is required");
    }
    if (!claudeCommentId) {
      throw new Error("CLAUDE_COMMENT_ID environment variable is required");
    }
    if (!repository) {
      throw new Error("REPOSITORY environment variable is required");
    }

    console.log("🚀 Starting Augment CLI execution...");
    
    // Update comment to show we're processing
    await updateProgressComment(
      githubToken,
      repository,
      claudeCommentId,
      "🤖 Augment is working on your request...",
      ""
    );

    // Check Node.js version
    console.log("📦 Checking Node.js version...");
    try {
      const { stdout: nodeVersion } = await execAsync("node --version");
      console.log(`Node.js version: ${nodeVersion.trim()}`);
      
      const majorVersion = parseInt(nodeVersion.trim().substring(1));
      if (majorVersion < 22) {
        throw new Error(`Node.js version ${majorVersion} is too old. Augment requires Node.js 22 or newer.`);
      }
    } catch (error) {
      console.error("❌ Failed to check Node.js version:", error);
      await updateProgressComment(
        githubToken,
        repository,
        claudeCommentId,
        "❌ **Error**: Failed to check Node.js version. Augment requires Node.js 22 or newer.",
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }

    // Setup Augment session file
    console.log("🔧 Setting up Augment session...");
    try {
      await setupAugmentSession(augmentApiKey);
    } catch (error) {
      console.error("❌ Failed to setup Augment session:", error);
      await updateProgressComment(
        githubToken,
        repository,
        claudeCommentId,
        "❌ **Error**: Failed to setup Augment session.",
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }

    // Execute Augment CLI (without API key in command since it's now in session file)
    const augmentCommand = `npx https://augment-assets.com/augment-latest.tgz --ni --github-api-token "${githubToken}" --instruction-file "${instructionFile}"`;
    
    console.log("🔧 Executing Augment CLI...");
    console.log(`Command: ${augmentCommand.replace(githubToken, "[REDACTED]")}`);

    let augmentOutput = "";
    let augmentError = "";

    try {
      const { stdout, stderr } = await execAsync(augmentCommand, {
        timeout: 15 * 60 * 1000, // 15 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      augmentOutput = stdout;
      augmentError = stderr;
      
      console.log("✅ Augment CLI completed successfully");
      if (augmentOutput) {
        console.log("📝 Augment output:", augmentOutput.substring(0, 500) + (augmentOutput.length > 500 ? "..." : ""));
      }
      if (augmentError) {
        console.log("⚠️ Augment stderr:", augmentError.substring(0, 500) + (augmentError.length > 500 ? "..." : ""));
      }

    } catch (error: any) {
      console.error("❌ Augment CLI failed:", error);
      
      // Capture partial output if available
      if (error.stdout) {
        augmentOutput = error.stdout;
      }
      if (error.stderr) {
        augmentError = error.stderr;
      }
      
      const errorMessage = error.message || "Unknown error occurred";
      await updateProgressComment(
        githubToken,
        repository,
        claudeCommentId,
        "❌ **Augment CLI Error**",
        `Error: ${errorMessage}\n\nStderr: ${augmentError}\n\nPartial output: ${augmentOutput}`
      );
      process.exit(1);
    }

    // Prepare final comment with Augment's response
    let finalComment = "✅ **Augment completed your request**\n\n";
    
    if (triggerUsername) {
      finalComment += `@${triggerUsername} `;
    }
    
    // Add the instruction file content for context
    try {
      const instructionContent = readFileSync(instructionFile, 'utf-8');
      if (instructionContent.trim()) {
        finalComment += `**Original Request:**\n\`\`\`\n${instructionContent.trim()}\n\`\`\`\n\n`;
      }
    } catch (error) {
      console.warn("Could not read instruction file for context:", error);
    }
    
    // Add Augment's response
    if (augmentOutput.trim()) {
      finalComment += `**Augment's Response:**\n${augmentOutput.trim()}\n\n`;
    } else {
      finalComment += "Augment completed the task but didn't provide detailed output.\n\n";
    }
    
    // Add any stderr as a note if it exists
    if (augmentError.trim()) {
      finalComment += `<details>\n<summary>Additional Info</summary>\n\n\`\`\`\n${augmentError.trim()}\n\`\`\`\n</details>\n\n`;
    }
    
    finalComment += `---\n*Powered by [Hud + Augment](https://www.hud.io)*`;

    // Update the GitHub comment with final result
    await updateProgressComment(
      githubToken,
      repository,
      claudeCommentId,
      "",
      finalComment
    );

    console.log("🎉 Successfully posted Augment response to GitHub");

  } catch (error) {
    console.error("💥 Fatal error in Augment entrypoint:", error);
    
    // Try to update comment with error if we have the necessary info
    const githubToken = process.env.GITHUB_TOKEN;
    const repository = process.env.REPOSITORY;
    const claudeCommentId = process.env.CLAUDE_COMMENT_ID;
    
    if (githubToken && repository && claudeCommentId) {
      try {
        await updateProgressComment(
          githubToken,
          repository,
          claudeCommentId,
          "💥 **Fatal Error**",
          `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`
        );
      } catch (updateError) {
        console.error("Failed to update comment with error:", updateError);
      }
    }
    
    process.exit(1);
  }
}

async function setupAugmentSession(augmentApiKey: string) {
  const homeDir = homedir();
  const augmentDir = join(homeDir, ".augment");
  const sessionFile = join(augmentDir, "session.json");

  // Create .augment directory if it doesn't exist
  try {
    mkdirSync(augmentDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }

  // Create session.json with the required format
  const sessionData = {
    accessToken: augmentApiKey,
    tenantURL: "https://d10.api.augmentcode.com/",
    scopes: ["read", "write"]
  };

  writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
  console.log(`✅ Created Augment session file: ${sessionFile}`);
}

async function updateProgressComment(
  githubToken: string,
  repository: string,
  commentId: string,
  status: string,
  content: string
) {
  const [owner, repo] = repository.split("/");
  
  if (!owner || !repo) {
    console.error("Invalid repository format:", repository);
    return;
  }
  
  const octokit = createOctokit(githubToken);
  
  let body = "";
  if (status) {
    body += `${status}\n\n`;
  }
  if (content) {
    body += content;
  }
  
  try {
    await updateClaudeComment(octokit.rest, {
      owner,
      repo,
      commentId: parseInt(commentId),
      body: body.trim(),
      isPullRequestReviewComment: false, // We'll let the function auto-detect
    });
  } catch (error) {
    console.error("Failed to update comment:", error);
    // Don't throw here, as this is just progress reporting
  }
}

if (import.meta.main) {
  run();
} 