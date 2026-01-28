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
この画像には植物管理用のタグが写っています。
タグに書かれている植物IDを読み取ってください。

【IDのパターン】
アルファベット1文字 + ハイフン + 数字2桁
例: A-01, B-12, C-05, Z-99

【重要な指示】
1. 画像をよく見て、タグに書かれている文字を正確に読み取ってください
2. 誤認識しやすい文字の修正:
   - 'o', 'O', 'D' → '0'（ゼロ）
   - 'l', 'I', ']', '}', '|' → '1'（イチ）
   - 小文字の'b' → 'B'（大文字のビー）
3. IDが見つかったら、そのIDだけを返してください（説明不要）
4. IDが見つからない場合は "NOT_FOUND" と返してください

返答例: A-01
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
