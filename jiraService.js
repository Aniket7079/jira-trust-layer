import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

export async function attachPDFToJira(issueKey, filePath) {
  try {
    const jiraUrl = `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`;
    const fileStream = fs.createReadStream(filePath);

    const res = await fetch(jiraUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
        ).toString("base64")}`,
        "X-Atlassian-Token": "no-check",
      },
      body: fileStream,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Jira API error:", errText);
      return { error: "Failed to upload to Jira", details: errText };
    }

    return await res.json();
  } catch (err) {
    console.error("❌ Jira upload error:", err);
    return { error: "Exception during Jira upload" };
  }
}
