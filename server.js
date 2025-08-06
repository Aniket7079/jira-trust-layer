
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());

// Secure key check
app.post('/analyze', async (req, res) => {
  try {
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader !== process.env.TRUST_LAYER_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { prompt } = req.body;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        user: 'forge-app'
      })
    });

    const data = await openaiRes.json();
    res.json({ result: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trust Layer running on port ${PORT}`));
