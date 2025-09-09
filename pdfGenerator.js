import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/**
 * generatePDF(content, issueKey, outputDir)
 * - content: string to put in the PDF
 * - issueKey: MUST be provided (no fallback)
 * - outputDir: directory to write the PDF (must exist or will be created)
 *
 * Returns: { filePath, filename }
 */
export async function generatePDF(content, issueKey, outputDir = "/tmp/public_pdfs") {
  return new Promise((resolve, reject) => {
    try {
      if (!issueKey) {
        throw new Error("❌ generatePDF called without a valid issueKey!");
      }

      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      // Clean filename (only allow safe chars)
      const safeKey = issueKey.toString().replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filename = `AI_Analysis_${safeKey}.pdf`;
      const filePath = path.join(outputDir, filename);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // === HEADER ===
      doc.fontSize(20).fillColor("#2c3e50").text("AI Analysis Report", { align: "center", underline: true });
      doc.moveDown();

      doc.fontSize(12).fillColor("#555").text(`Jira Issue: ${issueKey}`, { align: "center" });
      doc.moveDown();

      // === BODY ===
      doc.fontSize(12).fillColor("#000");
      const paragraphs = String(content).split(/\n{2,}/g);

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // Detect bullet points
        if (/^(\-|\*|\d+\.)\s+/.test(trimmed)) {
          const lines = trimmed.split(/\n/);
          for (const line of lines) {
            doc.text("• " + line.replace(/^(\-|\*|\d+\.)\s+/, ""), {
              align: "left",
              indent: 20,
            });
          }
          doc.moveDown(0.5);
        } else {
          // Regular paragraph
          doc.text(trimmed, { align: "left" });
          doc.moveDown();
        }
      }

      // === FOOTER ===
      const generatedAt = new Date().toLocaleString();
      doc.moveDown();
      doc.fontSize(10).fillColor("#555")
        .text(`Generated at: ${generatedAt}`, { align: "right" });

      doc.end();

      stream.on("finish", () => {
        console.log(`📂 PDF written: ${filePath}`);
        resolve({ filePath, filename });
      });

      stream.on("error", (err) => {
        console.error("❌ PDF stream error:", err);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
