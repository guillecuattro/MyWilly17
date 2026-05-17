export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { prompt, useSearch, maxTokens, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: { message: 'API key no proporcionada' } });

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens || 2000 }
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
