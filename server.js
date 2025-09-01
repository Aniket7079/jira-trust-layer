import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { generatePDF } from "./pdfGenerator.js";
import { attachPDFToJira } from "./jiraService.js";

dotenv.config();
const app = express();
app.use(express.json());

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
    console.log(`📨 Received prompt: ${prompt.substring(0, 80)}...`);

    // 🔹 Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }, // ⬆ Allow longer output
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("❌ Gemini API error:", errorText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await geminiRes.json();
    console.log("🔎 Gemini Raw Response:", JSON.stringify(data, null, 2));

    // 🔹 Extract AI response safely
    let aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
      "";

    if (!aiText.trim()) {
      console.warn("⚠ No AI response received from Gemini");
      aiText = "⚠ Gemini returned no usable response.";
    }

    console.log("✅ AI response received");
    console.log(aiText.substring(0, 200) + "..."); // preview first 200 chars

    // 🔹 Generate PDF even if AI response is fallback
    const pdfPath = await generatePDF(aiText, issueKey);
    console.log(`📂 PDF generated: ${pdfPath}`);

    // 🔹 Attach PDF to Jira (if issueKey exists)
    let jiraResult = null;
    if (issueKey) {
      jiraResult = await attachPDFToJira(issueKey, pdfPath);
    }

    res.json({
      result: aiText,
      pdf: pdfPath,
      jira: jiraResult || "⚠ Jira upload skipped (no issueKey)",
    });
  } catch (err) {
    console.error("❌ Trust Layer error:", err);
    res.status(500).json({ error: "AI request failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Trust Layer running on port ${PORT}`)
);
