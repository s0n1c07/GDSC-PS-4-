// --- START OF FILE website/llm_runner.js (Final, Guaranteed Parser Version) ---

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- CRITICAL: CONFIGURE THESE PATHS ---
const LLAMA_CPP_DIR = 'C:/Users/Rajve/OneDrive/Desktop/llama.cpp';
const MODEL_NAME = 'phi-2.Q2_K.gguf';
// -----------------------------------------

const llamaExecutablePath = path.join(LLAMA_CPP_DIR, 'bin', 'Release', 'llama-cli.exe');
const modelPath = path.join(LLAMA_CPP_DIR, 'models', MODEL_NAME);

if (!fs.existsSync(llamaExecutablePath)) throw new Error(`FATAL: Cannot find llama-cli.exe at ${llamaExecutablePath}`);
if (!fs.existsSync(modelPath)) throw new Error(`FATAL: Cannot find model file at ${modelPath}`);

async function getSummaryWithProgress(text, progressCallback) {
    // --- THE FINAL, BEST PROMPT ---
    // We put the instruction *after* the text. This often works better.
    const prompt = `ARTICLE:\n"""\n${text}\n"""\n\nINSTRUCTION: Based on the article above, provide a concise summary.\nSUMMARY:`;
    
    return new Promise((resolve, reject) => {
        const uniqueId = `job-${Date.now()}`;
        const tempDir = os.tmpdir();
        const promptFilePath = path.join(tempDir, `${uniqueId}-prompt.txt`);
        
        fs.writeFileSync(promptFilePath, prompt);
        console.log(`[LLM] Wrote final prompt to: ${promptFilePath}`);

        const args = [
            '-m', modelPath,
            '-f', promptFilePath,
            '-n', '128', // Max length of the summary
            '-t', '4',
            '--temp', '0.2',
            '--repeat-penalty', '1.1'
        ];
        
        console.log("[LLM] Spawning file-based process...");
        const llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

        let fullStdoutOutput = '';
        let fullStderrOutput = '';

        llamaProcess.stdout.on('data', (data) => {
            fullStdoutOutput += data.toString();
        });

        llamaProcess.stderr.on('data', (data) => {
            fullStderrOutput += data.toString();
            // This progress simulation is a best-effort guess
            if (fullStderrOutput.includes("llm_load_t")) progressCallback(25);
            if (fullStderrOutput.includes("sample_t")) progressCallback(50);
            if (fullStderrOutput.includes("prompt_eval_t")) progressCallback(75);
        });

        llamaProcess.on('close', (code) => {
            console.log(`[LLM] Process finished with exit code ${code}.`);
            progressCallback(100);

            if (fs.existsSync(promptFilePath)) fs.unlinkSync(promptFilePath);

            if (code === 0 && fullStdoutOutput) {
                try {
                    // --- THE FINAL, BULLETPROOF PARSER ---
                    // The AI's actual summary is the ONLY thing written to stdout.
                    // The original prompt is NOT included in stdout with the --file command.
                    
                    const summary = fullStdoutOutput.trim();

                    if (!summary) {
                        throw new Error("Model generated an empty summary.");
                    }

                    console.log(`[LLM] Extracted Summary: "${summary}"`);
                    resolve(summary);

                } catch (parseError) {
                    console.error("[LLM] FAILED TO PARSE OUTPUT. THIS IS THE FINAL DEBUGGING STEP.");
                    console.error("--- FULL STDOUT (The AI's direct response) ---");
                    console.error(fullStdoutOutput);
                    console.error("--- FULL STDERR (Logs and errors from the program) ---");
                    console.error(fullStderrOutput);
                    console.error("-------------------------------------------------");
                    reject(parseError);
                }
            } else {
                console.error("[LLM] Process failed or produced no output. Full error log from stderr:", fullStderrOutput);
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