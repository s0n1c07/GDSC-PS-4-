let llmEngine = null;
let isInitializing = false;

async function initializeLLM() {
    if (llmEngine) return;
    if (isInitializing) { // Prevent multiple initializations at once
        await new Promise(resolve => setTimeout(resolve, 1000));
        return initializeLLM();
    }
    isInitializing = true;
    
    try {
        console.log('URL Nexus: Initializing local LLM engine...');
        const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm');
        llmEngine = await CreateMLCEngine("TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC", {
            initProgressCallback: (progress) => {
                console.log(`LLM loading progress: ${progress.text}`);
            }
        });
        console.log('URL Nexus: LLM engine initialized successfully.');
    } catch (error) {
        console.error('URL Nexus: Failed to initialize LLM engine:', error);
        llmEngine = null; // Reset on failure
    } finally {
        isInitializing = false;
    }
}

export async function analyzeContentWithLLM(content) {
    if (!llmEngine) {
        await initializeLLM();
        if (!llmEngine) return { isQuality: false, summary: "LLM not available." };
    }
    
    const prompt = `
Analyze the following text from a webpage to determine if it's high-quality, meaningful content worth saving to a reading list.
Respond ONLY with a JSON object in the format:
{"is_quality": boolean, "summary": "A brief, one-sentence summary.", "category": "article/tutorial/news/research/other"}

- "is_quality" should be true only for substantial, informative content like articles, long-form tutorials, or research papers. It should be false for homepages, search results, or short news updates.
- "summary" must be a concise, single sentence.
- "category" should be your best guess.

Content to analyze:
Title: "${content.title}"
Text snippet: "${content.text.substring(0, 2000)}..."
`;

    try {
        const response = await llmEngine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 200,
        });
        const rawResponse = response.choices[0].message.content;
        
        // Clean up the response to extract only the JSON part
        const jsonMatch = rawResponse.match(/\{.*\}/s);
        if (!jsonMatch) throw new Error("LLM did not return valid JSON.");
        
        const result = JSON.parse(jsonMatch[0]);
        
        return {
            isQuality: result.is_quality || false,
            summary: result.summary || "No summary generated.",
            category: result.category || "other"
        };
    } catch (error) {
        console.error('URL Nexus: LLM analysis failed:', error);
        return { isQuality: true, summary: "Content seems interesting, but AI analysis failed.", category: 'article' };
    }
}