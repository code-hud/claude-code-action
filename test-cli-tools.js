#!/usr/bin/env node

/**
 * Test script to verify CLI tools work correctly
 * Run: node test-cli-tools.js [tool] [prompt]
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

const tool = process.argv[2] || 'codex-cli';
const prompt = process.argv[3] || 'Hello, can you help me write a simple function?';

console.log(`Testing ${tool} with prompt: "${prompt}"`);

// Create a test prompt file
const promptFile = './test-prompt.txt';
fs.writeFileSync(promptFile, prompt);

const configs = {
  'codex-cli': {
    command: 'npx',
    args: ['@openai/codex', 'exec', '--full-auto', `Read and execute: ${promptFile}`],
    env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY }
  },
  'claude-cli': {
    command: 'npx', 
    args: ['@anthropic-ai/claude-code', '--prompt-file', promptFile],
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
  }
};

const config = configs[tool];
if (!config) {
  console.error(`Unknown tool: ${tool}`);
  process.exit(1);
}

console.log(`Running: ${config.command} ${config.args.join(' ')}`);

const result = spawnSync(config.command, config.args, {
  stdio: 'inherit',
  env: { ...process.env, ...config.env }
});

console.log(`\nExit code: ${result.status}`);

// Cleanup
fs.unlinkSync(promptFile);

if (result.status === 0) {
  console.log('✅ CLI tool test successful!');
} else {
  console.log('❌ CLI tool test failed');
} 