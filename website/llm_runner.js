// --- START OF FILE llm_runner.js ---

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // Import the 'fs' module to check if files exist

// --- CRITICAL: CONFIGURE THIS PATH ---
// Use forward slashes. This path MUST point to the folder containing 'bin' and 'models'.
const LLAMA_CPP_DIR = 'C:/Users/Rajve/OneDrive/Desktop/llama.cpp';

// Use the EXACT filename of your model.
const MODEL_NAME = 'tinyllama-1.1b-chat-v1.0-q4_k_m.gguf';
// -----------------------------------------

const llamaExecutablePath = path.join(LLAMA_CPP_DIR, 'bin', 'Release', 'llama-cli.exe');
const modelPath = path.join(LLAMA_CPP_DIR, 'models', MODEL_NAME);

// --- Pre-run Sanity Checks ---
if (!fs.existsSync(llamaExecutablePath)) {
    throw new Error(`FATAL: Cannot find llama-cli.exe. Looked in: ${llamaExecutablePath}. Please check the LLAMA_CPP_DIR path in llm_runner.js.`);
}
if (!fs.existsSync(modelPath)) {
    throw new Error(`FATAL: Cannot find model file. Looked for: ${modelPath}. Please check the MODEL_NAME in llm_runner.js and ensure the file is in the 'models' subfolder.`);
}


async function getSummaryWithProgress(text, progressCallback) {
    console.log("LLM Runner: Starting process on CPU...");
    
    return new Promise((resolve, reject) => {
        const prompt = `Summarize the following content in 2-3 key sentences. Content:\n\n${text}\n\nSummary:`;
        
        // Arguments for the command-line tool
        const args = [
            '-m', modelPath,      // Model path
            '-n', '128',          // Max tokens to generate
            '--prompt', prompt,   // The prompt
            '-t', '4'             // Number of CPU threads to use
        ];
        
        console.log(`LLM Runner: Spawning executable at ${llamaExecutablePath}`);

        const llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

        let summary = '';
        let errorOutput = '';

        // Capture error messages from the process
        llamaProcess.stderr.on('data', (data) => {
            const output = data.toString();
            errorOutput += output;
            // Look for the percentage pattern like "[ 25.1%]"
            const progressMatch = output.match(/\[\s*(\d+\.?\d*)\s*%\]/);
            if (progressMatch && progressMatch[1]) {
                const percentage = Math.round(parseFloat(progressMatch[1]));
                progressCallback(percentage);
            }
        });

        // Capture the successful summary output
        llamaProcess.stdout.on('data', (data) => {
            summary += data.toString();
        });

        // Handle process exit
        llamaProcess.on('close', (code) => {
            console.log(`LLM process exited with code ${code}`);
            if (code === 0) {
                progressCallback(100); // Ensure it finishes at 100%
                const finalSummary = summary.split("Summary:")[1]?.trim() || "Summary could not be extracted from model output.";
                resolve(finalSummary);
            } else {
                console.error("LLM Runner: Process failed. Full error output:", errorOutput);
                reject(new Error(`LLM process failed with code ${code}. Check server console.`));
            }
        });

        // Handle fatal errors, like if the .exe can't be started at all
        llamaProcess.on('error', (err) => {
            console.error("LLM Runner: FATAL - Could not spawn the process. Check file paths and permissions.", err);
            reject(new Error("Failed to start the LLM executable."));
        });
    });
}

module.exports = { getSummaryWithProgress };