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
      filename: filePath.split("/").pop(), // ✅ Proper filename
    });

    const authHeader = `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString("base64")}`;

    const res = await fetch(jiraUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "X-Atlassian-Token": "no-check", // ✅ required
        ...form.getHeaders(), // ✅ important for multipart
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
    console.log(`📤 Successfully attached PDF to Jira issue ${issueKey}`);
    return json;
  } catch (err) {
    console.error("❌ Jira upload exception:", err.message || err);
    return { error: "Exception during Jira upload", details: err };
  }
}
