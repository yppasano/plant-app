// front/plant/api/correct-text.js

export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: "API Key not configured" });
    }

    // データの受け取り（念のため、文字列でもオブジェクトでも対応できるようにする）
    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return response.status(400).json({ error: "Invalid JSON" });
        }
    }
    const { text } = body;

    // テキストが空っぽなら即終了
    if (!text || text.trim().length === 0) {
        return response.status(200).json({ id: "NOT_FOUND" });
    }

    // Geminiへの命令（より強力に修正させる）
    const prompt = `
    あなたはOCR（文字認識）の補正係です。
    以下の「ノイズ混じりのテキスト」から、植物の管理IDを推測して抽出してください。

    【IDのパターン】
    アルファベット1文字 + ハイフン + 数字2桁（例: A-01, B-12, C-05）

    【修正ルール】
    1. ノイズやゴミ文字はすべて無視してください。
    2. 誤認識を積極的に修正してください。
       - 'o', 'O', 'D' -> '0'
       - 'l', 'I', ']', '}', '|' -> '1'
       - 'Z', 'S' -> '2'
       - 'b', '6' -> 'B'
    3. 例: "2 A-o]" -> "A-01", "s-12.." -> "S-12"
    4. 余計な説明は不要。修正後のIDだけを返してください。
    5. どうしてもIDらしきものが見つからない場合のみ "NOT_FOUND" と返してください。

    【対象テキスト】
    ${text}
    `;

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await res.json();
        
        // AIの答えを取り出す（安全策を追加）
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