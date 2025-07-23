#!/usr/bin/env bun

/**
 * Execute the specified CLI tool for AI code assistance
 * Supports: claude-cli, gemini-cli, codex-cli, augment-cli
 */

import * as core from "@actions/core";
import { spawnSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";

interface CliToolConfig {
  command: string;
  installCommand?: string[];
  args: string[];
  envSetup?: Record<string, string>;
}

function getCliToolConfig(cliTool: string): CliToolConfig {
  const promptFile = process.env.PROMPT_FILE || "";
  const allowedTools = process.env.ALLOWED_TOOLS || "";
  const disallowedTools = process.env.DISALLOWED_TOOLS || "";
  const timeoutMinutes = process.env.TIMEOUT_MINUTES || "30";
  const maxTurns = process.env.MAX_TURNS || "";
  const model = process.env.MODEL || "";
  const mcpConfig = process.env.MCP_CONFIG || "";
  const apiKey = process.env.API_KEY || "";
  const aiEnv = process.env.AI_ENV || "";

  switch (cliTool) {
    case "claude-cli":
      return {
        command: "npx",
        installCommand: ["npm", "install", "-g", "@anthropic-ai/claude-code"],
        args: [
          "@anthropic-ai/claude-code",
          "--prompt-file", promptFile,
          "--allowed-tools", allowedTools,
          "--disallowed-tools", disallowedTools,
          "--timeout-minutes", timeoutMinutes,
          ...(maxTurns ? ["--max-turns", maxTurns] : []),
          ...(model ? ["--model", model] : []),
          ...(mcpConfig ? ["--mcp-config", mcpConfig] : []),
          ...(process.env.USE_BEDROCK === "true" ? ["--use-bedrock"] : []),
          ...(process.env.USE_VERTEX === "true" ? ["--use-vertex"] : []),
        ],
        envSetup: {
          ANTHROPIC_API_KEY: apiKey,
          ANTHROPIC_MODEL: model,
          ...(aiEnv ? JSON.parse(aiEnv) : {}),
        },
      };

    case "gemini-cli":
      return {
        command: "npx",
        installCommand: ["npm", "install", "-g", "@google-ai/generativelanguage"],
        args: [
          "@google-ai/generativelanguage",
          "--input-file", promptFile,
          "--model", model || "gemini-pro",
          "--max-tokens", "2048",
          "--timeout", timeoutMinutes,
        ],
        envSetup: {
          GOOGLE_API_KEY: apiKey,
          GOOGLE_AI_MODEL: model,
          ...(aiEnv ? JSON.parse(aiEnv) : {}),
        },
      };

    case "codex-cli":
      return {
        command: "npx",
        installCommand: ["npm", "install", "-g", "@openai/codex"],
        args: [
          "@openai/codex",
          "exec",
          `--full-auto`,
          `Read and execute: ${promptFile}`,
        ],
        envSetup: {
          OPENAI_API_KEY: apiKey,
          OPENAI_MODEL: model,
          ...(aiEnv ? JSON.parse(aiEnv) : {}),
        },
      };

    case "augment-cli":
      return {
        command: "npx",
        installCommand: ["npm", "install", "-g", "openai"], // Using OpenAI CLI as fallback
        args: [
          "openai",
          "api",
          "completions.create",
          "-m", model || "gpt-4",
          "--prompt", `$(cat ${promptFile})`,
          "--max-tokens", "2048",
        ],
        envSetup: {
          OPENAI_API_KEY: apiKey, // Fallback to OpenAI API
          OPENAI_MODEL: model,
          ...(aiEnv ? JSON.parse(aiEnv) : {}),
        },
      };

    default:
      throw new Error(`Unsupported CLI tool: ${cliTool}. Supported tools: claude-cli, gemini-cli, codex-cli, augment-cli`);
  }
}

async function installCliTool(config: CliToolConfig): Promise<void> {
  if (!config.installCommand) {
    return;
  }

  console.log(`Installing ${config.installCommand.join(" ")}...`);
  const installResult = spawnSync(config.installCommand[0], config.installCommand.slice(1), {
    stdio: "inherit",
    env: { ...process.env },
  });

  if (installResult.status !== 0) {
    throw new Error(`Failed to install CLI tool: ${config.installCommand.join(" ")}`);
  }
}

async function executeCliTool(config: CliToolConfig): Promise<{ outputFile: string; conclusion: string }> {
  // Set up environment variables
  const env = {
    ...process.env,
    ...config.envSetup,
  };

  console.log(`Executing: ${config.command} ${config.args.join(" ")}`);
  
  // Create output file path
  const outputDir = process.env.RUNNER_TEMP || "/tmp";
  const outputFile = join(outputDir, "ai-execution-output.json");

  const result = spawnSync(config.command, config.args, {
    stdio: "inherit",
    env,
    cwd: process.cwd(),
  });

  // Determine conclusion based on exit code
  const conclusion = result.status === 0 ? "success" : "failure";

  // Create a simple output file (CLI tools might create their own, but we ensure one exists)
  if (!existsSync(outputFile)) {
    const outputData = [
      {
        type: "result",
        status: conclusion,
        exit_code: result.status,
        command: `${config.command} ${config.args.join(" ")}`,
        timestamp: new Date().toISOString(),
      }
    ];
    writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
  }

  return { outputFile, conclusion };
}

async function run() {
  try {
    const cliTool = process.env.CLI_TOOL || "claude-cli";
    console.log(`Using CLI tool: ${cliTool}`);

    // Validate that required environment variables are set
    if (!process.env.PROMPT_FILE) {
      throw new Error("PROMPT_FILE environment variable is required");
    }

    if (!existsSync(process.env.PROMPT_FILE)) {
      throw new Error(`Prompt file not found: ${process.env.PROMPT_FILE}`);
    }

    // Get CLI tool configuration
    const config = getCliToolConfig(cliTool);

    // Install CLI tool if needed
    await installCliTool(config);

    // Execute the CLI tool
    const { outputFile, conclusion } = await executeCliTool(config);

    // Set outputs for the GitHub Action
    core.setOutput("execution_file", outputFile);
    core.setOutput("conclusion", conclusion);

    if (conclusion !== "success") {
      core.setFailed(`CLI tool execution failed with exit code: ${conclusion}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Execute CLI failed: ${errorMessage}`);
    core.setFailed(`Execute CLI failed: ${errorMessage}`);
    
    // Create a failure output file
    const outputDir = process.env.RUNNER_TEMP || "/tmp";
    const outputFile = join(outputDir, "ai-execution-output.json");
    const outputData = [
      {
        type: "error",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }
    ];
    writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    core.setOutput("execution_file", outputFile);
    core.setOutput("conclusion", "failure");
    
    process.exit(1);
  }
}

run(); 