import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/**
 * generatePDF(content, issueKey, outputDir)
 * - content: string to put in the PDF
 * - issueKey: will be used in filename (if provided)
 * - outputDir: directory to write the PDF (must exist or will be created)
 *
 * Returns: { filePath, filename }
 */
export async function generatePDF(content, issueKey = null, outputDir = "/tmp/public_pdfs") {
  return new Promise((resolve, reject) => {
    try {
      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      // Clean filename (only allow safe chars)
      const safeKey = (issueKey || Date.now()).toString().replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filename = `AI_Analysis_${safeKey}.pdf`;
      const filePath = path.join(outputDir, filename);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(16).text("AI Analysis Report", { align: "center" });
      doc.moveDown();

      // Body (split long content into paragraphs)
      doc.fontSize(12);
      const paragraphs = String(content).split(/\n{2,}/g);
      for (const para of paragraphs) {
        doc.text(para.trim(), { align: "left" });
        doc.moveDown();
      }

      // Footer: timestamp
      const generatedAt = new Date().toISOString();
      doc.moveDown();
      doc.fontSize(10).text(`Generated at: ${generatedAt}`, { align: "right" });

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
