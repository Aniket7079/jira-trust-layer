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
  // options: { pdfPublicUrl: string, addComment: boolean }
  try {
    if (!fs.existsSync(filePath)) {
      console.error("❌ File not found:", filePath);
      return { error: "File does not exist", filePath };
    }

    const jiraUrl = `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${issueKey}/attachments`;

    const filename = filePath.split("/").pop();

    // Build form
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), { filename });

    const authHeader = `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString("base64")}`;

    // Retry loop for transient errors
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

        // success
        const json = res.data;
        const attachment = Array.isArray(json) ? json[0] : json?.values?.[0] || (json && json[0]);

        console.log(`📤 Jira attach HTTP ${res.status} ${res.statusText}`);
        if (attachment) {
          console.log(`📤 Successfully attached: ${attachment.filename} -> ${attachment.content}`);
          const result = {
            filename: attachment.filename,
            url: attachment.content,
            size: attachment.size,
            raw: json,
          };

          // Optionally add a comment with public PDF link (if provided)
          if (options.pdfPublicUrl && options.addComment) {
            try {
              await addCommentToIssue(issueKey, `AI PDF: ${options.pdfPublicUrl}`);
            } catch (commentErr) {
              console.warn("⚠ Failed to add Jira comment with public link:", commentErr.message || commentErr);
            }
          }

          return result;
        } else {
          console.warn("⚠ Jira attach succeeded but attachment object missing in response", json);
          return { raw: json };
        }
      } catch (err) {
        const status = err?.response?.status;
        const body = err?.response?.data || err?.message || String(err);
        console.error(`❌ Jira attach attempt ${attempt + 1} failed. status=${status} body=`, body);

        // If quota/forbidden/unauth -> don't retry
        if (status && [400, 401, 403, 413, 415].includes(status)) {
          return { error: "non-retryable", status, details: body };
        }

        // last attempt -> give up
        if (attempt === MAX_RETRIES) {
          return { error: "failed after retries", status, details: body };
        }

        // else wait and retry
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    } // end retry loop
  } catch (err) {
    console.error("❌ Jira upload exception:", err?.message || err);
    return { error: "Exception during Jira upload", details: err?.message || err };
  }
}

// helper to add a comment to the issue
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
