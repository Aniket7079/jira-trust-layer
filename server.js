import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());

app.post('/analyze', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ Missing GEMINI_API_KEY in environment");
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader !== process.env.TRUST_LAYER_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { prompt } = req.body;
    console.log(`📨 Received prompt: ${prompt.substring(0, 50)}...`);

    // ✅ Use correct Gemini model name & endpoint
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("❌ Gemini API error:", errorText);
      return res.status(500).json({ error: 'AI request failed' });
    }

    const data = await geminiRes.json();
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠ No AI response";
    res.json({ result: aiText });
  } catch (err) {
    console.error("❌ Trust Layer error:", err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Trust Layer running on port ${PORT}`));
