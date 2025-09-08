// jiraService.js
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function attachPDFToJira(issueKey, filePath, options = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error("❌ File not found:", filePath);
      return { error: "File does not exist", filePath };
    }

    const jiraUrl = `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${issueKey}/attachments`;
    const filename = filePath.split("/").pop();

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), { filename });

    const authHeader = `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString("base64")}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await axios.post(jiraUrl, form, {
          headers: {
            Authorization: authHeader,
            "X-Atlassian-Token": "no-check",
            ...form.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000,
        });

        console.log(`📤 Jira attach HTTP ${res.status} ${res.statusText}`);
        const json = res.data;

        // Jira returns an array of attachments
        const attachment = Array.isArray(json) ? json[0] : json;

        if (attachment) {
          console.log(`📎 Attached file: ${attachment.filename} -> ${attachment.content}`);

          // Always add Jira comment with either Jira link or your public link
          if (options.pdfPublicUrl) {
            await addCommentToIssue(
              issueKey,
              `📎 AI-generated analysis attached.\n\n🔗 Public PDF: ${options.pdfPublicUrl}\n\n📂 Jira-hosted copy: ${attachment.content}`
            );
          }

          return {
            filename: attachment.filename,
            jiraUrl: attachment.content, // Jira’s permanent link
            size: attachment.size,
            raw: json,
          };
        }

        return { error: "No attachment object in response", raw: json };
      } catch (err) {
        const status = err?.response?.status;
        const body = err?.response?.data || err?.message || String(err);
        console.error(`❌ Jira attach attempt ${attempt + 1} failed. status=${status}`, body);

        if (status && [400, 401, 403, 413, 415].includes(status)) {
          return { error: "non-retryable", status, details: body };
        }

        if (attempt === MAX_RETRIES) {
          return { error: "failed after retries", status, details: body };
        }

        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  } catch (err) {
    console.error("❌ Jira upload exception:", err?.message || err);
    return { error: "Exception during Jira upload", details: err?.message || err };
  }
}

async function addCommentToIssue(issueKey, comment) {
  const url = `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${issueKey}/comment`;
  const authHeader = `Basic ${Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64")}`;

  const res = await axios.post(
    url,
    { body: comment },
    {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return res.data;
}
