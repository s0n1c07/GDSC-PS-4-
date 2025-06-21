// --- START OF FILE llm_runner.js (Advanced, Persistent Version) ---
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// --- CONFIGURE THESE PATHS ---
const LLAMA_CPP_DIR = "C:/Users/Rajve/OneDrive/Desktop/llama.cpp";
const MODEL_NAME = "tinyllama-1.1b-chat-v1.0-q4_k_m.gguf";
// -----------------------------------------

const llamaExecutablePath = path.join(
  LLAMA_CPP_DIR,
  "bin",
  "Release",
  "llama-cli.exe"
);
const modelPath = path.join(LLAMA_CPP_DIR, "models", MODEL_NAME);

let llamaProcess = null;
let requestQueue = [];
let isReady = false;

function startLlmProcess() {
  console.log("LLM Runner: Starting persistent AI engine process...");

  // Arguments for interactive mode
  const args = [
    "-m",
    modelPath,
    "-n",
    "-1", // Run indefinitely
    "--color",
    "-i", // Interactive mode
    "-t",
    "4",
  ];

  llamaProcess = spawn(llamaExecutablePath, args, { cwd: LLAMA_CPP_DIR });

  llamaProcess.stdout.on("data", (data) => {
    const text = data.toString();
    // Check if there's a pending request to resolve
    if (requestQueue.length > 0) {
      const currentRequest = requestQueue.shift();
      // Clean up the model's output to get only the summary
      const summary = text.replace(currentRequest.prompt, "").trim();
      currentRequest.resolve(summary);
    }
  });

  llamaProcess.stderr.on("data", (data) => {
    const text = data.toString();
    console.log(`LLM_STDERR: ${text}`);
    // The model is ready for input when it prints the prompt indicator `>`
    if (text.includes(">")) {
      if (!isReady) {
        console.log("LLM Runner: AI Engine is ready and waiting for requests.");
        isReady = true;
      }
      // Handle any pending requests that came in while loading
      if (requestQueue.length > 0) {
        const pending = requestQueue[0];
        if (!pending.isSent) {
          llamaProcess.stdin.write(pending.prompt + "\n");
          pending.isSent = true;
        }
      }
    }
  });

  llamaProcess.on("close", (code) => {
    console.error(
      `LLM Runner: AI Engine process exited unexpectedly with code ${code}. Restarting...`
    );
    isReady = false;
    llamaProcess = null;
    setTimeout(startLlmProcess, 5000); // Attempt to restart after 5s
  });

  llamaProcess.on("error", (err) => {
    console.error("LLM Runner: FATAL - Could not spawn the process.", err);
  });
}

// Start the single, persistent process when the module is loaded
startLlmProcess();

async function getSummaryWithProgress(text, progressCallback) {
  // For now, we simulate progress since we get the result in one chunk
  progressCallback(25);

  const prompt = `Summarize the following content in 2-3 key sentences. Content:\n\n${text}\n\nSummary:`;

  return new Promise((resolve, reject) => {
    const request = { prompt, resolve, reject, isSent: false };
    requestQueue.push(request);

    // If the model is ready, send the request immediately
    if (isReady) {
      llamaProcess.stdin.write(prompt + "\n");
      request.isSent = true;
    }
  }).then((summary) => {
    progressCallback(100);
    return summary;
  });
}

module.exports = { getSummaryWithProgress };
