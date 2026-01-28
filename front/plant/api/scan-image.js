// front/plant/api/scan-image.js
// Gemini Vision APIで画像から植物IDを直接認識

export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: "API Key not configured" });
    }

    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return response.status(400).json({ error: "Invalid JSON" });
        }
    }

    const { imageBase64 } = body;

    if (!imageBase64) {
        return response.status(400).json({ error: "No image provided" });
    }

    // base64のプレフィックスを削除（data:image/jpeg;base64, などを除去）
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `
あなたは植物管理用のIDタグ読み取り専門AIです。
画像に写っているタグから、植物IDを読み取ってください。

【IDの形式】必ず以下のパターンです：
- 大文字アルファベット1文字 + ハイフン + 2桁の数字
- 例: A-01, B-12, C-05, Z-99

【タスク】
1. 画像をよく観察して、タグに書かれている文字を見つけてください
2. 文字列が上記のパターンに一致するか確認してください
3. 一致する場合は、そのIDだけを返してください（余計な説明は不要）
4. 見つからない場合は "NOT_FOUND" と返してください

【注意】
- 誤認識しやすい文字に注意: O→0, I/l→1, b→B
- 返答は ID のみ（例: A-01）か "NOT_FOUND" のどちらか
- 余計な説明、記号、改行は不要
`;

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        const data = await res.json();
        
        let resultText = "NOT_FOUND";
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            resultText = data.candidates[0].content.parts[0].text.trim();
        }

        return response.status(200).json({ id: resultText });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: "AI processing failed" });
    }
}
