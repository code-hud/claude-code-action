import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";

export async function checkAndDeleteEmptyBranch(
  octokit: Octokits,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  let branchLink = "";
  let shouldDeleteBranch = false;

  if (claudeBranch) {
    // Check if Claude made any commits to the branch
    try {
      const { data: comparison } =
        await octokit.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${baseBranch}...${claudeBranch}`,
        });

      // If there are no commits, check if this is an Augment analysis run
      if (comparison.total_commits === 0) {
        // Check if AUGMENT_API_KEY is set (indicates Augment run)
        const isAugmentRun = !!process.env.AUGMENT_API_KEY;
        
        if (isAugmentRun) {
          // For Augment runs, show branch link even without commits (analysis branches)
          console.log(
            `Branch ${claudeBranch} has no commits but showing link for Augment analysis`,
          );
          const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
          branchLink = `\n[View branch](${branchUrl})`;
        } else {
          // For Claude runs, delete empty branches as before
          console.log(
            `Branch ${claudeBranch} has no commits from Claude, will delete it`,
          );
          shouldDeleteBranch = true;
        }
      } else {
        // Branch has commits, always add branch link
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    } catch (error) {
      console.error("Error checking for commits on Claude branch:", error);
      // If we can't check, assume the branch has commits to be safe
      const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
      branchLink = `\n[View branch](${branchUrl})`;
    }
  }

  // Delete the branch if it has no commits
  if (shouldDeleteBranch && claudeBranch) {
    try {
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${claudeBranch}`,
      });
      console.log(`✅ Deleted empty branch: ${claudeBranch}`);
    } catch (deleteError) {
      console.error(`Failed to delete branch ${claudeBranch}:`, deleteError);
      // Continue even if deletion fails
    }
  }

  return { shouldDeleteBranch, branchLink };
}
