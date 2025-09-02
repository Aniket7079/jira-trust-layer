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

// Public PDF folder (served by Express)
const PDF_DIR = process.env.PDF_DIR || "/tmp/public_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });
app.use("/pdfs", express.static(PDF_DIR)); // public URL: /pdfs/<filename>

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
    console.log("🔎 Gemini Raw Response (truncated):", JSON.stringify(data?.candidates?.[0], null, 2).slice(0, 2000));

    // Extract AI text safely
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
    console.log(`🌐 PDF Public URL: ${pdfPublicUrl}`);
    console.log(`📂 PDF generated at path: ${filePath}`);

    // Build public URL for download
    let baseUrl = process.env.SERVER_URL;
    if (!baseUrl) {
      // fallback: use the incoming request host
      baseUrl = `${req.protocol}://${req.get("host")}`;
      console.warn(`⚠ SERVER_URL not set. Falling back to request host: ${baseUrl}`);
    }
    const pdfPublicUrl = `${baseUrl.replace(/\/$/, "")}/pdfs/${encodeURIComponent(filename)}`;

    // Return AI text + downloadable link immediately
    res.json({
      result: aiText,
      pdfUrl: pdfPublicUrl,
      jira: issueKey
        ? `Attachment is being processed for Jira issue ${issueKey}.`
        : "No issueKey provided — Jira attach skipped.",
    });

    // Background: attach file to Jira (don’t block response)
    if (issueKey) {
      (async () => {
        try {
          console.log(`🔔 Starting background Jira attach for ${issueKey} -> ${filename}`);
          const jiraResult = await attachPDFToJira(issueKey, filePath);
          console.log("📤 Jira attach result:", jiraResult);
        } catch (attachErr) {
          console.error("❌ Background Jira attach failed:", attachErr);
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

