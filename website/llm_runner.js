// --- START OF FILE website/llm_runner.js (Final, Bug-Fixed Version) ---

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- CRITICAL: CONFIGURE THESE PATHS ---
const LLAMA_CPP_DIR = 'C:/Users/Rajve/OneDrive/Desktop/llama.cpp';
const MODEL_NAME = 'tinyllama-1.1b-chat-v1.0-q4_k_m.gguf';
// -----------------------------------------

const llamaExecutablePath = path.join(LLAMA_CPP_DIR, 'bin', 'Release', 'llama-cli.exe');
const modelPath = path.join(LLAMA_CPP_DIR, 'models', MODEL_NAME);

if (!fs.existsSync(llamaExecutablePath)) throw new Error(`FATAL: Cannot find llama-cli.exe. Looked in: ${llamaExecutablePath}`);
if (!fs.existsSync(modelPath)) throw new Error(`FATAL: Cannot find model file. Looked for: ${modelPath}`);

async function getSummaryWithProgress(text, progressCallback) {
    const prompt = `<|system|>\nYou are a helpful assistant that provides concise, one-sentence summaries of web content.\n<|user|>\nSummarize the following text in a single, informative sentence:\n\n${text}\n<|assistant|>\n`;

    return new Promise((resolve, reject) => {
        console.log("[LLM] Spawning one-shot process...");

        const args = [
            '-m', modelPath,
            '-n', '128',
            '--prompt', prompt,
            '-t', '4',
            '--temp', '0.2',
            '--repeat-penalty', '1.2',
            '-r', '<|user|>',
            '-r', '\n'
        ];

        const llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

        let finalOutput = '';
        let errorOutput = '';

        llamaProcess.stdout.on('data', (data) => {
            finalOutput += data.toString();
        });

        // Capture progress percentages and errors from stderr
        llamaProcess.stderr.on('data', (data) => {
            // --- THIS IS THE FIX ---
            // We define 'output' from the 'data' chunk before using it.
            const output = data.toString();
            errorOutput += output;

            const progressMatch = output.match(/\[\s*(\d+\.?\d*)\s*%\]/);
            if (progressMatch && progressMatch[1]) {
                progressCallback(Math.round(parseFloat(progressMatch[1])));
            }
        });

        llamaProcess.on('close', (code) => {
            console.log(`[LLM] Process finished with code ${code}`);
            if (code === 0 && finalOutput) {
                progressCallback(100);
                const assistantMarker = "<|assistant|>";
                const startIndex = finalOutput.indexOf(assistantMarker);

                if (startIndex !== -1) {
                    let summary = finalOutput.substring(startIndex + assistantMarker.length).trim();
                    summary = summary.split('<|user|>')[0].trim().split('\n')[0].trim();
                    console.log(`[LLM] Extracted Summary: "${summary}"`);
                    resolve(summary);
                } else {
                    console.error("[LLM] Could not find assistant marker in output. Full output:", finalOutput);
                    reject(new Error("Failed to parse model output."));
                }
            } else {
                console.error("[LLM] Process failed or produced no output. Error log:", errorOutput);
                reject(new Error(`LLM process failed. See server console.`));
            }
        });

        llamaProcess.on('error', (err) => reject(err));
    });
}

module.exports = { getSummaryWithProgress };