
import fetch from "node-fetch";

/**
 * Fetch the README.md or specific file from a GitHub repo
 * @param {string} githubUrl - Full repo URL (e.g. https://github.com/user/repo)
 */
export async function fetchRepoContents(githubUrl) {
  try {
    const githubToken = process.env.GITHUB_TOKEN;

    // Extract owner/repo from the URL
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/);
    if (!match) {
      throw new Error("Invalid GitHub URL");
    }
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");

    // 👉 Example 1: Fetch README.md
    const readmeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
      {
        method: "GET",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3.raw",
        },
      }
    );

    let readmeContent = "";
    if (readmeResponse.ok) {
      readmeContent = await readmeResponse.text();
    } else {
      console.warn(`⚠️ No README.md found in ${owner}/${repo}`);
    }

    // 👉 Example 2: Fetch repo file tree (first 50 files for preview)
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
      {
        headers: { Authorization: `token ${githubToken}` },
      }
    );

    let fileList = [];
    if (treeResponse.ok) {
      const treeData = await treeResponse.json();
      fileList = treeData.tree
        .filter((f) => f.type === "blob")
        .slice(0, 50) // limit to avoid huge payloads
        .map((f) => f.path);
    }

    return {
      owner,
      repo,
      readme: readmeContent,
      files: fileList,
    };
  } catch (error) {
    console.error(`❌ GitHub fetch failed: ${error.message}`);
    return null;
  }
}
