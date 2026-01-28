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
この画像には植物管理用のIDタグが写っています。

【あなたのタスク】
画像内のタグに書かれている文字を読み取り、植物IDを抽出してください。

【IDの形式】
- 形式: [大文字アルファベット1文字]-[2桁の数字]
- 具体例:
  * A-01
  * B-12
  * C-05
  * D-23
  * Z-99

【手順】
1. 画像全体をスキャンして、文字が書かれている部分を探す
2. 白いタグ、プレート、ラベルなどに注目
3. 手書き文字でも印刷文字でも読み取る
4. "A-01" のようなパターンを見つけたら、それを返す
5. どうしても見つからない場合のみ "NOT_FOUND" を返す

【重要】
- 返答は必ず1行のみ
- IDが見つかった場合: そのIDだけを返す（例: A-01）
- 見つからない場合: NOT_FOUND

【よくある誤認識の修正】
- 'O' や 'o' → '0'（ゼロ）
- 'I' や 'l' → '1'（イチ）
- 小文字 → 大文字

今すぐ画像を見て、IDを返してください:
`;

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        
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
