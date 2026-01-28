// front/plant/api/test-gemini.js
// Gemini APIキーのテスト用エンドポイント

export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // APIキーの存在確認
    if (!apiKey) {
        return response.status(500).json({ 
            success: false,
            error: "GEMINI_API_KEY is not configured",
            message: "環境変数が設定されていません"
        });
    }

    // APIキーの形式確認（先頭部分のみ表示）
    const keyPreview = apiKey.substring(0, 10) + "...";

    // Geminiに簡単なリクエストを送信
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: "Hello! Please respond with 'OK' if you can read this." }]
                }]
            })
        });

        const data = await res.json();
        
        // エラーチェック
        if (data.error) {
            return response.status(500).json({
                success: false,
                error: "Gemini API Error",
                details: data.error,
                keyPreview: keyPreview
            });
        }

        // 成功
        let geminiResponse = "No response";
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            geminiResponse = data.candidates[0].content.parts[0].text;
        }

        return response.status(200).json({
            success: true,
            message: "✅ Gemini APIは正常に動作しています！",
            keyPreview: keyPreview,
            geminiResponse: geminiResponse,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return response.status(500).json({
            success: false,
            error: "Request failed",
            message: error.toString(),
            keyPreview: keyPreview
        });
    }
}
