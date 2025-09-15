import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { generatePDF } from "./pdfGenerator.js";
import { attachPDFToJira } from "./jiraService.js";

dotenv.config();
const app = express();
app.use(express.json());

const PDF_DIR = process.env.PDF_DIR || "/tmp/public_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });
app.use("/pdfs", express.static(PDF_DIR)); 

async function addCommentToJira(issueKey, comment) {
  try {
    const jiraUrl = `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/comment`;

    const authHeader = `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString("base64")}`;

    const res = await fetch(jiraUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Failed to add Jira comment: ${res.status}`, errText);
    } else {
      console.log(`💬 Comment added to Jira issue ${issueKey}`);
    }
  } catch (err) {
    console.error("❌ Jira comment exception:", err.message || err);
  }
}

app.post("/analyze", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ Missing GEMINI_API_KEY in environment");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader !== process.env.TRUST_LAYER_KEY) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { prompt, issueKey } = req.body;
    console.log(`📨 Received prompt: ${String(prompt).substring(0, 120)}...`);

    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, maxContinues: 3 },
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
      "";

    if (!aiText.trim()) {
      console.warn("⚠ No AI response received from Gemini — creating fallback content.");
      aiText = "⚠ Gemini returned no usable response.";
    }

    console.log("✅ AI response received (length):", aiText.length);

    // Generate PDF into public folder
    const { filePath, filename } = await generatePDF(aiText, issueKey, PDF_DIR);
    console.log(`📂 PDF generated at path: ${filePath}`);

    // Build public URL for download
    let baseUrl = process.env.SERVER_URL;
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get("host")}`;
      console.warn(`⚠ SERVER_URL not set. Falling back to request host: ${baseUrl}`);
    }
    const pdfPublicUrl = `${baseUrl.replace(/\/$/, "")}/pdfs/${encodeURIComponent(filename)}`;
    console.log(`🌐 PDF Public URL: ${pdfPublicUrl}`);

    // Send immediate response
    res.json({
      result: aiText,
      pdfUrl: pdfPublicUrl,
      jira: issueKey
        ? `Attachment is being processed for Jira issue ${issueKey}.`
        : "No issueKey provided — Jira attach skipped.",
    });

    // Background: Attach to Jira
    if (issueKey) {
      (async () => {
        try {
          console.log(`🔔 Attaching PDF to Jira issue ${issueKey}`);
          const jiraResult = await attachPDFToJira(issueKey, filePath);

          if (jiraResult?.url) {
            console.log(`📤 Jira attachment success: ${jiraResult.url}`);
          } else {
            console.error("⚠ Jira attach failed or returned no URL", jiraResult);
          }

          // Always add comment with public URL
          await addCommentToJira(
            issueKey,
            `📎 AI-generated analysis attached.\n\n🔗 Public PDF: ${pdfPublicUrl}`
          );
        } catch (attachErr) {
          console.error("❌ Jira attach exception:", attachErr);
        }
      })();
    }
  } catch (err) {
    console.error("❌ Trust Layer error:", err);
    res.status(500).json({ error: "AI request failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Trust Layer running on port ${PORT}`));






