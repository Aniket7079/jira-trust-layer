import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { generatePDF } from "./pdfGenerator.js";
import { attachPDFToJira } from "./jiraService.js";
// ⬇️ NEW: import GitHub client
import { fetchRepoContents } from "./githubClient.js";

dotenv.config();
const app = express();
app.use(express.json());

const PDF_DIR = process.env.PDF_DIR || "/tmp/public_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });
app.use("/pdfs", express.static(PDF_DIR)); 

// ... (keep addCommentToJira as is)

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

    // ⬇️ Updated: now accept githubUrl
    const { prompt, issueKey, githubUrl } = req.body;
    console.log(`📨 Received prompt: ${String(prompt).substring(0, 120)}...`);
    if (githubUrl) console.log(`🌐 GitHub repo provided: ${githubUrl}`);

    let repoSummary = "";
    if (githubUrl) {
      try {
        const repoData = await fetchRepoContents(githubUrl);
        if (repoData?.files?.length) {
          console.log(`📦 Repo fetched: ${repoData.files.length} files`);

          // Build a summary (limit size to avoid token overload)
          repoSummary = repoData.files
            .map((f) => `# File: ${f.path}\n${f.content.substring(0, 1000)}\n`)
            .join("\n---\n");

          // Trim if too large
          if (repoSummary.length > 15000) {
            repoSummary = repoSummary.substring(0, 15000) + "\n... [truncated]";
          }
        } else {
          console.warn("⚠ Repo fetch returned no files.");
        }
      } catch (err) {
        console.error("❌ GitHub fetch error:", err.message || err);
      }
    }

    // ⬇️ Updated: merge prompt + repo summary
    const finalPrompt = githubUrl
      ? `Here is the task:\n${prompt}\n\nAnalyze the following repo and suggest improvements/next steps:\n${repoSummary}`
      : prompt;

    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
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
      "";

    if (!aiText.trim()) {
      console.warn("⚠ No AI response received from Gemini — creating fallback content.");
      aiText = "⚠ Gemini returned no usable response.";
    }

    console.log("✅ AI response received (length):", aiText.length);

    // Generate PDF into public folder
    const { filePath, filename } = await generatePDF(aiText, issueKey, PDF_DIR);
    console.log(`📂 PDF generated at path: ${filePath}`);

    let baseUrl = process.env.SERVER_URL;
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get("host")}`;
      console.warn(`⚠ SERVER_URL not set. Falling back to request host: ${baseUrl}`);
    }
    const pdfPublicUrl = `${baseUrl.replace(/\/$/, "")}/pdfs/${encodeURIComponent(filename)}`;

    res.json({
      result: aiText,
      pdfUrl: pdfPublicUrl,
      jira: issueKey
        ? `Attachment is being processed for Jira issue ${issueKey}.`
        : "No issueKey provided — Jira attach skipped.",
    });

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

// ... keep PORT/app.listen as is
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

