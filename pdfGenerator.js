import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generatePDF(content, issueKey) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `AI_Analysis_${issueKey || Date.now()}.pdf`;
      const filePath = path.join("/tmp", fileName); // ✅ use /tmp for Render

      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(16).text("AI Analysis Report", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(content, { align: "left" });

      doc.end();

      stream.on("finish", () => {
        console.log(`📂 PDF generated: ${filePath}`);
        resolve(filePath);
      });
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}
