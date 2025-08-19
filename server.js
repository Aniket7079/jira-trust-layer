import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";
import { PDFDocument, rgb } from "pdf-lib";  // for PDF generation

const app = express();
app.use(bodyParser.json());

app.post("/generate-pdf", async (req, res) => {
  try {
    const { issueKey, description } = req.body;

    // Step 1: Call Gemini API
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_GEMINI_API_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Generate design doc for: ${description}` }] }]
      })
    });
    const geminiData = await geminiResponse.json();
    const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No content";

    // Step 2: Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { height } = page.getSize();
    page.drawText(generatedText, { x: 50, y: height - 100, size: 12, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    const fileName = `${issueKey}-design-doc.pdf`;
    fs.writeFileSync(fileName, pdfBytes);

    // Step 3: Attach PDF to Jira
    const jiraResponse = await fetch(`https://your-domain.atlassian.net/rest/api/3/issue/${issueKey}/attachments`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from("YOUR_EMAIL:YOUR_API_TOKEN").toString("base64")}`,
        "X-Atlassian-Token": "no-check"
      },
      body: fs.createReadStream(fileName)
    });

    const jiraResult = await jiraResponse.json();

    res.json({
      message: "PDF generated and attached to Jira",
      jiraResult
    });

  } catch (error) {
    console.error("Error in /generate-pdf:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Trust Layer running on port 3000");
});
