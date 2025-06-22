// --- START OF FILE website/llm_runner.js (Final, Powerful, and Robust Version) ---

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- CRITICAL: CONFIGURE THESE PATHS ---
const LLAMA_CPP_DIR = 'C:/Users/Rajve/OneDrive/Desktop/llama.cpp';
const MODEL_NAME = 'tinyllama-1.1b-chat-v1.0-q4_k_m.gguf';
// -----------------------------------------

const llamaExecutablePath = path.join(LLAMA_CPP_DIR, 'bin', 'Release', 'llama-cli.exe');
const modelPath = path.join(LLAMA_CPP_DIR, 'models', MODEL_NAME);

// Pre-run Sanity Checks to give clear errors on startup
if (!fs.existsSync(llamaExecutablePath)) {
    throw new Error(`FATAL: Cannot find llama-cli.exe. Looked in: ${llamaExecutablePath}. Please check your build and path.`);
}
if (!fs.existsSync(modelPath)) {
    throw new Error(`FATAL: Cannot find model file. Looked for: ${modelPath}. Please check the MODEL_NAME and that the file is in the 'models' folder.`);
}

async function getSummaryWithProgress(text, progressCallback) {
    // --- THE NEW, SUPERCHARGED PROMPT ---
    // This structured format tells the model exactly what its role is.
    const prompt = `<|system|>\nYou are an expert assistant that provides a single, concise, and neutral summary of the provided text.\n<|user|>\nSummarize this content in one sentence:\n\n${text}\n<|assistant|>\n`;

    return new Promise((resolve, reject) => {
        console.log("[LLM] Spawning one-shot process with powerful parameters...");

        // --- THE NEW, SMARTER PARAMETERS ---
        const args = [
            '-m', modelPath,          // Model path
            '-n', '128',              // Max words/tokens to generate
            '--prompt', prompt,       // The full, structured prompt
            '-t', '4',                // Number of CPU threads
            '--temp', '0.2',          // Low temperature for factual, non-random output
            '--repeat-penalty', '1.2',// Prevent word repetition
            '-r', '</s>'             // Hard stop token to prevent rambling
        ];

        const llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

        let fullModelOutput = '';
        let errorOutput = '';

        // The entire model output (including our prompt) will be captured from stdout
        llamaProcess.stdout.on('data', (data) => {
            fullModelOutput += data.toString();
        });

        // Progress percentages and any C++ level errors are captured from stderr
        llamaProcess.stderr.on('data', (data) => {
            const output = data.toString();
            errorOutput += output;
            // A more robust regex to capture progress like "54 / 128"
            const progressMatch = output.match(/(\d+) \/ \d+ tokens/);
            if (progressMatch && progressMatch[1]) {
                const currentTokens = parseInt(progressMatch[1]);
                // Calculate percentage based on a max of 128 tokens
                progressCallback(Math.round((currentTokens / 128) * 100));
            }
        });

        // When the process is completely finished, parse the output
        llamaProcess.on('close', (code) => {
            console.log(`[LLM] Process finished with exit code ${code}.`);

            if (code === 0 && fullModelOutput) {
                progressCallback(100); // Ensure it finishes at 100%

                // --- THE NEW, BULLETPROOF PARSING LOGIC ---
                const assistantMarker = "<|assistant|>\n";
                const startIndex = fullModelOutput.indexOf(assistantMarker);

                if (startIndex !== -1) {
                    // Get only the text generated AFTER the assistant marker
                    let summary = fullModelOutput.substring(startIndex + assistantMarker.length).trim();

                    // Clean up any stray stop tokens
                    summary = summary.replace(/<\/s>/g, '').trim();

                    console.log(`[LLM] Extracted Summary: "${summary}"`);
                    resolve(summary);
                } else {
                    console.error("[LLM] CRITICAL: Could not find assistant marker in the model's output. This indicates a fundamental model issue.");
                    console.error("[LLM] Full model output:", fullModelOutput);
                    reject(new Error("Failed to parse model output."));
                }
            } else {
                console.error("[LLM] Process failed or produced no output. Full error log from stderr:", errorOutput);
                reject(new Error(`LLM process failed. See server console for error logs.`));
            }
        });

        llamaProcess.on('error', (err) => {
            console.error("[LLM] FATAL: Could not spawn the process.", err);
            reject(new Error("Failed to start the LLM executable. Check paths and permissions."));
        });
    });
}

module.exports = { getSummaryWithProgress };