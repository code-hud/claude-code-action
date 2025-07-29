import { GITHUB_SERVER_URL } from "../../api/config";

// Hud-branded loading spinner with cyan colors matching the logo
export const SPINNER_HTML =
  '<span style="display: inline-block; width: 14px; height: 14px; border: 2px solid #0df; border-top: 2px solid transparent; border-radius: 50%; animation: hud-spin 1s linear infinite; vertical-align: middle; margin-left: 4px;"></span><style>@keyframes hud-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>';

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${jobRunUrl})`;
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${branchName}`;
  return `\n[View branch](${branchUrl})`;
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
): string {
  return `Hud is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
