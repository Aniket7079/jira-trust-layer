import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

export async function attachPDFToJira(issueKey, filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error("❌ File not found:", filePath);
      return { error: "File does not exist" };
    }

    const jiraUrl = `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`;

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: filePath.split("/").pop(),
    });

    const authHeader = `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString("base64")}`;

    const res = await fetch(jiraUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "X-Atlassian-Token": "no-check",
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Jira API error:", errText);
      return {
        error: "Failed to upload to Jira",
        status: res.status,
        details: errText,
      };
    }

    const json = await res.json();
    const attachment = json?.[0]; // Jira returns an array

    if (attachment) {
      console.log(
        `📤 Successfully attached PDF to Jira issue ${issueKey} → ${attachment.content}`
      );
      return {
        filename: attachment.filename,
        url: attachment.content, // ✅ direct download URL
        size: attachment.size,
      };
    }

    return { warning: "No attachment object returned", raw: json };
  } catch (err) {
    console.error("❌ Jira upload exception:", err.message || err);
    return { error: "Exception during Jira upload", details: err };
  }
}
