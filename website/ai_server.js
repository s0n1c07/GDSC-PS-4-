// ai_server.js - Runs ONLY on your home computer
const express = require('express');
const bodyParser = require('body-parser');
const { getSummaryWithProgress } = require('./llm_runner.js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const AI_SERVER_PORT = 4000; // Run on a different port

app.post('/summarize', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).send('Text is required.');

    console.log("AI Server: Received request, starting LLM...");
    try {
        // We don't need progress callbacks here, so we pass an empty function
        const summary = await getSummaryWithProgress(text, () => {});
        res.json({ summary: summary });
    } catch (error) {
        console.error("AI Server Error:", error);
        res.status(500).json({ error: 'Failed to generate summary.' });
    }
});

app.listen(AI_SERVER_PORT, () => {
    console.log(`Your local AI Engine is listening on http://localhost:${AI_SERVER_PORT}`);
});