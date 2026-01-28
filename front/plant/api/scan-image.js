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
あなたは文字認識の専門家です。この画像には植物管理用のIDタグが写っています。

【重要: タグに書かれている文字を必ず読み取ってください】
画像内のどこかに、アルファベット1文字とハイフンと数字2桁が書かれています。
例: A-01, B-12, C-05, Z-99

【具体的な手順】
1. 画像全体を注意深く見てください
2. 紙、プラスチック、タグ、ラベルなど、文字が書かれている物を探してください
3. 手書き、印刷、どちらでも構いません
4. 以下のパターンを探してください:
   - 1文字のアルファベット（A〜Z）
   - ハイフン記号（-）
   - 2桁の数字（00〜99）
5. 例: "A-01" や "B-12" のような文字列

【文字の読み取りルール】
- 'O'（オー）→ '0'（ゼロ）に修正
- 'l'（小文字エル）または 'I'（アイ）→ '1'（イチ）に修正
- アルファベットは大文字に変換

【返答フォーマット】
- 見つかった場合: そのIDのみを返す（例: A-01）
- 見つからない場合: NOT_FOUND

画像をよく見て、必ずIDを探してください。小さい文字、薄い文字、斜めの文字でも読み取ってください。
`;

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
        
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
        let rawResponse = null;
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            rawResponse = data.candidates[0].content.parts[0].text;
            resultText = rawResponse.trim();
        }

        return response.status(200).json({ 
            id: resultText,
            debug: {
                rawResponse: rawResponse,
                fullResponse: data
            }
        });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: "AI processing failed" });
    }
}
