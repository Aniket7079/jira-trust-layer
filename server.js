import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import PDFDocument from "pdfkit";
import axios from "axios";
import FormData from "form-data";
import { getLLMResponse } from "./llmClient.js";  // still using your Gemini client

const app = express();
app.use(bodyParser.json());

// Jira credentials (use env vars in production)
const JIRA_BASE_URL = "https://your-domain.atlassian.net";
const JIRA_EMAIL = "your-email@example.com";
const JIRA_API_TOKEN = "your-api-token";

async function uploadToJira(issueKey, filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          "X-Atlassian-Token": "no-check",
        },
        auth: {
          username: JIRA_EMAIL,
          password: JIRA_API_TOKEN,
        },
      }
    );
    console.log("✅ File uploaded to Jira:", response.data);
  } catch (error) {
    console.error("❌ Jira upload failed:", error.response?.data || error.message);
  }
}

// Endpoint to generate doc + attach to Jira
app.post("/generate-doc", async (req, res) => {
  const { issueKey, prompt } = req.body;

  try {
    // 1. Get response from Gemini
    const designDoc = await getLLMResponse(prompt);

    // 2. Generate PDF
    const pdfPath = `./output-${issueKey}.pdf`;
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(18).text("Design Document", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(designDoc);
    doc.end();

    stream.on("finish", async () => {
      // 3. Upload to Jira
      await uploadToJira(issueKey, pdfPath);

      res.json({ success: true, message: "PDF generated and uploaded to Jira", file: pdfPath });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("🚀 Server running on port 3000"));
