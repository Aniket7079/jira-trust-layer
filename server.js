import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { generatePDF } from "./pdfGenerator.js";
import { attachPDFToJira } from "./jiraService.js";
import { fetchRepoContents } from "./githubClient.js";  // 🔑 NEW IMPORT

dotenv.config();
const app = express();
app.use(express.json());

const PDF_DIR = process.env.PDF_DIR || "/tmp/public_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });
app.use("/pdfs", express.static(PDF_DIR));

app.post("/analyze", async (req, res) => {
  try {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader !== process.env.TRUST_LAYER_KEY) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { prompt, issueKey, githubUrl } = req.body;  // 🔑 include githubUrl
    console.log(`📨 Received analyze request (issue: ${issueKey}, repo: ${githubUrl || "none"})`);

    let enrichedPrompt = prompt || "";

    // 🔑 If GitHub URL is provided, fetch repo contents
    if (githubUrl) {
      console.log(`📂 Fetching repo contents for ${githubUrl}`);
      const repoData = await fetchRepoContents(githubUrl);

      if (repoData?.files?.length) {
        // Limit to first few files to avoid token explosion
        const repoSummary = repoData.files
          .slice(0, 10)
          .map(f => `# ${f.path}\n${f.content.substring(0, 1000)}`)
          .join("\n\n");

        enrichedPrompt += `\n\n---\nGitHub Repo: ${repoData.owner}/${repoData.repo}\n${repoSummary}`;
      } else {
        enrichedPrompt += `\n\n⚠ Could not fetch repo contents for ${githubUrl}`;
      }
    }

    // 🔑 Send enrichedPrompt to Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: enrichedPrompt }] }],
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
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠ No AI response.";

    console.log("✅ AI response length:", aiText.length);

    // 🔑 Generate PDF + Jira attach (your existing logic unchanged)
    const { filePath, filename } = await generatePDF(aiText, issueKey, PDF_DIR);
    const baseUrl = process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
    const pdfPublicUrl = `${baseUrl.replace(/\/$/, "")}/pdfs/${encodeURIComponent(filename)}`;

    res.json({ result: aiText, pdfUrl: pdfPublicUrl });

    if (issueKey) {
      (async () => {
        await attachPDFToJira(issueKey, filePath);
      })();
    }
  } catch (err) {
    console.error("❌ Trust Layer error:", err);
    res.status(500).json({ error: "AI request failed" });
  }
});
