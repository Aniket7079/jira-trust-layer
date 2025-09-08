// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import { generatePDF } from "./pdfGenerator.js";
import { attachPDFToJira } from "./jiraService.js";

dotenv.config();
const app = express();
app.use(express.json());

// Temp PDF storage
const PDF_DIR = process.env.PDF_DIR || "/tmp/public_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });

/** 🔹 Add comment to Jira */
async function addCommentToJira(issueKey, text) {
  const url = `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/comment`;
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", content: [{ type: "text", text }] }
        ]
      }
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Jira comment failed:", err);
    return null;
  }
  return await res.json();
}

app.post("/analyze", async (req, res) => {
  try {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader !== process.env.TRUST_LAYER_KEY) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { prompt, issueKey } = req.body;
    if (!issueKey) {
      return res.status(400).json({ error: "Missing Jira issueKey" });
    }

    // 👉 Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("❌ Gemini API error:", errorText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await geminiRes.json();
    let aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts.map((p) => p.text).join("\n")
        : "") ||
      "⚠ Gemini returned no usable response.";

    // 👉 Generate PDF locally
    const { filePath, filename } = await generatePDF(aiText, issueKey, PDF_DIR);

    // 👉 Attach PDF to Jira
    const jiraResult = await attachPDFToJira(issueKey, filePath);

    if (jiraResult?.id) {
      // Build Jira attachment URL
      const jiraAttachmentUrl = `${process.env.JIRA_BASE_URL}/secure/attachment/${jiraResult.id}/${filename}`;

      // 👉 Add comment with Jira-hosted link
      const commentText = `📎 AI-generated report attached: [${filename}|${jiraAttachmentUrl}]`;
      await addCommentToJira(issueKey, commentText);

      return res.json({
        result: aiText,
        jiraAttachment: jiraAttachmentUrl,
        message: "PDF successfully attached and Jira comment added."
      });
    } else {
      return res.status(500).json({ error: "Failed to attach to Jira" });
    }
  } catch (err) {
    console.error("❌ Trust Layer error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Trust Layer running on port ${PORT}`));
