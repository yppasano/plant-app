// front/plant/api/list-models.js
// 利用可能なGeminiモデルのリストを取得

export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return response.status(500).json({ error: "API Key not configured" });
    }

    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        
        const res = await fetch(listUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        const data = await res.json();
        
        if (data.error) {
            return response.status(500).json({
                error: "Failed to list models",
                details: data.error
            });
        }

        // 利用可能なモデルをフィルタ（generateContentをサポートするもの）
        const models = data.models || [];
        const visionModels = models.filter(model => 
            model.supportedGenerationMethods && 
            model.supportedGenerationMethods.includes('generateContent')
        );

        return response.status(200).json({
            success: true,
            totalModels: models.length,
            visionModels: visionModels.length,
            availableModels: visionModels.map(m => ({
                name: m.name,
                displayName: m.displayName,
                description: m.description
            }))
        });

    } catch (error) {
        return response.status(500).json({
            error: "Request failed",
            message: error.toString()
        });
    }
}
