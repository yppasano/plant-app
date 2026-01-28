// front/plant/api/correct-text.js

export default async function handler(request, response) {
    // APIキーが設定されているか確認
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: "API Key not configured" });
    }

    // スマホから送られてきたテキストを受け取る
    const { text } = JSON.parse(request.body);

    // Geminiへの命令文（プロンプト）
    const prompt = `
    あなたはOCR（文字認識）の補正係です。
    以下の「汚れたテキスト」から、植物の管理IDを探し出して抽出してください。

    【ルール】
    1. IDの形式は「アルファベット1文字 + ハイフン + 数字2桁」です（例: A-01, B-12, C-05）。
    2. OCRの誤認識を推測して修正してください（例: "A-Ol" -> "A-01", "B_05" -> "B-05", "4-01" -> "A-01"）。
    3. 余計な説明は一切不要です。修正後のIDだけを返してください。
    4. どうしてもIDが見つからない場合は "NOT_FOUND" とだけ返してください。

    【汚れたテキスト】
    ${text}
    `;

    try {
        // Gemini APIを呼び出す
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await res.json();
        const resultText = data.candidates[0].content.parts[0].text.trim();

        // スマホ側に結果を返す
        return response.status(200).json({ id: resultText });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: "AI processing failed" });
    }
}