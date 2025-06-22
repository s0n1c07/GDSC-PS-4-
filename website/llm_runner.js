// --- START OF FILE website/llm_runner.js (Final, Perfected Version) ---

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- CRITICAL: CONFIGURE THESE PATHS ---
const LLAMA_CPP_DIR = 'C:/Users/Rajve/OneDrive/Desktop/llama.cpp';
// You chose a good, fast model. Let's stick with it.
const MODEL_NAME = 'gpt2-medium-q4_0.gguf';
// -----------------------------------------

const llamaExecutablePath = path.join(LLAMA_CPP_DIR, 'bin', 'Release', 'llama-cli.exe');
const modelPath = path.join(LLAMA_CPP_DIR, 'models', MODEL_NAME);

if (!fs.existsSync(llamaExecutablePath)) throw new Error(`FATAL: Cannot find llama-cli.exe at ${llamaExecutablePath}`);
if (!fs.existsSync(modelPath)) throw new Error(`FATAL: Cannot find model file at ${modelPath}`);


async function getSummaryWithProgress(text, progressCallback) {
    // A clean prompt for the AI.
    const cleanText = text.substring(0, 1500);
    const prompt = `Article content: ${cleanText}\n\nWrite a short summary:\n\n`;

    return new Promise((resolve, reject) => {
        const uniqueId = `job-${Date.now()}`;
        const tempDir = os.tmpdir();
        const promptFilePath = path.join(tempDir, `${uniqueId}-prompt.txt`);

        fs.writeFileSync(promptFilePath, prompt);
        console.log(`[LLM] Wrote prompt to: ${promptFilePath}`);

        // --- THE FINAL, CORRECT PARAMETERS ---
        const args = [
            '-m', modelPath,
            '-f', promptFilePath,
            '-n', '100',
            '-t', '6',
            '--temp', '0.4',
            '--repeat-penalty', '1.1',
            '--batch-size', '256',
            '--ctx-size', '512',
            '--no-mmap',
            '--threads-batch', '6',
            // THIS IS THE MOST IMPORTANT FIX:
            '--no-display-prompt'
        ];

        console.log("[LLM] Spawning file-based process...");
        const llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

        let finalSummaryOutput = ''; // This will ONLY contain the summary
        let errorLogOutput = '';     // This will contain logs

        // The AI's answer will be the only thing on stdout
        llamaProcess.stdout.on('data', (data) => {
            finalSummaryOutput += data.toString();
        });

        // Logs and progress are on stderr
        llamaProcess.stderr.on('data', (data) => {
            errorLogOutput += data.toString();
            if (errorLogOutput.includes("llm_load_t")) progressCallback(25);
            if (errorLogOutput.includes("sample_t")) progressCallback(50);
            if (errorLogOutput.includes("prompt_eval_t")) progressCallback(75);
        });

        llamaProcess.on('close', (code) => {
            console.log(`[LLM] Process finished with exit code ${code}.`);
            progressCallback(100);

            if (fs.existsSync(promptFilePath)) fs.unlinkSync(promptFilePath);

            if (code === 0 && finalSummaryOutput) {
                // --- THE NEW, SIMPLE PARSER ---
                // No complex cleaning needed. The output IS the summary.
                const cleanSummary = finalSummaryOutput.trim();

                if (!cleanSummary) {
                    throw new Error("Model generated an empty summary.");
                }

                console.log(`[LLM] Extracted Clean Summary: "${cleanSummary}"`);
                resolve(cleanSummary);

            } else {
                console.error("[LLM] Process failed or produced no output. Full error log:", errorLogOutput);
                reject(new Error(`LLM process failed.`));
            }
        });

        llamaProcess.on('error', (err) => {
            if (fs.existsSync(promptFilePath)) fs.unlinkSync(promptFilePath);
            reject(err);
        });
    });
}

module.exports = { getSummaryWithProgress };