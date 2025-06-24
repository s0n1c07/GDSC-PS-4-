# Reading and Watch-List Extension

A powerful browser extension and web application that automatically captures, processes, and summarizes web content using local AI. Track your digital consumption, discover what others are reading, and get AI-powered summaries of the content you engage with.

## 🌟 Features

- **Automatic Content Capture**: Browser extension silently tracks pages you visit for 15+ seconds
- **Local AI Processing**: Uses llama.cpp with GPT-2 Medium for content summarization
- **Real-time Dashboard**: Web interface showing your processed content in real-time
- **User Discovery**: Explore what other users are reading and summarizing
- **Privacy-Focused**: All AI processing happens locally on your machine
- **WebSocket Integration**: Live updates as content is being processed

## 🏗️ Architecture

The project consists of two main components:

### 1. Chrome Extension (`chrome-extension/`)
- **Background Script**: Monitors tab activity and manages content processing
- **Content Script**: Extracts meaningful content from web pages
- **Popup Interface**: Login/logout and basic statistics

### 2. Web Application (`website/`)
- **Node.js Server**: API endpoints and WebSocket server
- **SQLite Database**: User accounts and saved content storage
- **Single Page Application**: Dashboard for viewing and discovering content
- **Local LLM Integration**: Processes content using llama.cpp

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **Chrome Browser** (for extension)
- **llama.cpp** compiled and configured
- **GPT-2 Medium model** (GGUF format)

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/s0n1c07/GDSC-PS-4-
cd reading-watchlist-extension
```

### 2. Install Dependencies
```bash
cd website
npm install
```

### 3. Configure LLM Setup
Edit `website/llm_runner.js` and update these paths:
```javascript
const LLAMA_CPP_DIR = 'C:/path/to/your/llama.cpp';
const MODEL_NAME = 'gpt2-medium-q4_0.gguf';
```

Ensure you have:
- llama.cpp compiled with `llama-cli.exe` in the `bin/Release/` directory
- GPT-2 Medium model file in the `models/` directory

### 4. Start the Server
```bash
cd website
node server.js
```
The server will start on `http://localhost:3000`

### 5. Install Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension/` directory
5. The extension will appear in your browser toolbar

## 🔧 Configuration

### Database Setup
The SQLite database is automatically created on first run with these tables:
- `users` - User accounts and authentication
- `saved_items` - Processed content and summaries
- `follows` - User following relationships (future feature)

### Extension Settings
The extension automatically:
- Tracks pages visited for 15+ seconds
- Excludes social media and search engines
- Requires user login through popup
- Sends content to local server for processing

### LLM Configuration
Current setup uses GPT-2 Medium with these parameters:
- Context size: 512 tokens
- Generation length: 100 tokens
- Temperature: 0.4
- 6 CPU threads for processing

## 📱 Usage

### Getting Started
1. **Register/Login**: Create an account through the extension popup or web interface
2. **Browse Normally**: The extension automatically captures content from pages you spend time on
3. **View Dashboard**: Check `http://localhost:3000` to see your processed content
4. **Discover Others**: Explore what other users are reading in the Discover section

### Extension Features
- **Status Indicator**: Shows if AI is actively processing content
- **Statistics**: Displays number of pages processed
- **Manual Login**: Access through extension popup

### Web Dashboard Features
- **Real-time Updates**: See content being processed live
- **Content History**: All your summarized content in chronological order
- **User Discovery**: Browse other users' public reading lists
- **Responsive Design**: Works on desktop and mobile devices

## 🔒 Privacy & Security

- **Local Processing**: All AI summarization happens on your local machine
- **Encrypted Passwords**: User passwords are hashed using bcrypt
- **JWT Authentication**: Secure token-based authentication
- **Content Filtering**: Automatically excludes sensitive sites and personal information

## 🛠️ Development

### Project Structure
```
├── chrome-extension/
│   ├── manifest.json          # Extension configuration
│   ├── icons/                 # icons for extension
│   ├── background.js          # Service worker for tab monitoring
│   ├── content_script.js      # Content extraction from web pages
│   └── popup/                 # Extension popup interface
├── website/
│   ├── server.js              # Express server and API routes
│   ├── database.js            # SQLite database setup
│   ├── llm_runner.js          # Local LLM integration
│   ├── public/                # Static web assets
│   └── views/                 # EJS templates (legacy)
```

### API Endpoints
- `POST /api/users/register` - User registration
- `POST /api/users/login` - User authentication
- `POST /api/process-url` - Submit content for processing
- `GET /api/users` - Get all users (for discovery)
- `GET /api/users/:userId/items` - Get user's processed content

### WebSocket Events
- `status_update` - AI processing status changes
- `queued` - Content added to processing queue
- `progress` - Processing progress updates
- `complete` - Processing finished with summary
- `error` - Processing failed

## 🧪 Testing

### Manual Testing
1. Install extension and create account
2. Visit various websites and wait 15+ seconds per page
3. Check dashboard for automatically captured content
4. Verify AI summaries are generated correctly

### Extension Testing
- Test on different types of websites
- Verify content extraction quality
- Check popup functionality and statistics

## 🔄 Future Enhancements

- **Better Models**: Support for larger language models
- **Content Categories**: Automatic categorization of content
- **Social Features**: Following other users, sharing content
- **Mobile App**: Native mobile application
- **Cloud Sync**: Optional cloud synchronization
- **Export Features**: Export reading lists and summaries

## 🐛 Troubleshooting

### Common Issues

**Extension not capturing content:**
- Check if you're logged in through the extension popup
- Verify the website isn't in the excluded list
- Ensure you spend at least 15 seconds on the page

**AI processing errors:**
- Verify llama.cpp paths in `llm_runner.js`
- Check that the model file exists and is accessible
- Ensure sufficient RAM for model loading

**WebSocket connection issues:**
- Confirm server is running on localhost:3000
- Check browser console for connection errors
- Verify firewall isn't blocking WebSocket connections

### Debug Mode
Enable debug logging by checking browser console and server logs for detailed error information.

**Note**: This project requires local AI model setup and is designed for personal use and development purposes. Ensure you have adequate system resources for running local language models.
