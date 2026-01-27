<body>
    <div align="center">
        <h1>
            WhatsBot 🤖<br/>
            <img alt="Build Status" src="https://img.shields.io/badge/build-passing-brightgreen">
            <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/yaasiin-ayeva/WhatsBot">
            <img alt="GitHub forks" src="https://img.shields.io/github/forks/yaasiin-ayeva/WhatsBot">
            <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
        </h1>
        <img src="public/botavatar.gif" alt="WhatsBot Preview" width="40%" style="max-width: 300px; border-radius: 8px;">
        <p>
            <strong>A simple WhatsApp bot with AI, social media downloads, CRM, and multilingual support</strong><br>
            Built with NodeJS & TypeScript, powered by Gemini & ChatGPT APIs
        </p>
        <p>
            🎯 Try it live: <a href="https://wa.me/qr/SBHRATABRAZVA1" target="_blank">WhatsBot Playground</a> or scan the QR code below:
        </p>
        <br>
        <img src="public/qr.jpg" width="35%" alt="WhatsApp QR Code" style="margin-top: 20px;">
    </div>
</body>

---

## Features

### AI-Powered Conversations
- **Voice Chat**: Send voice messages and get audio responses powered by Gemini AI + AssemblyAI + Speechify
- **Gemini AI Chat**: Advanced AI conversations with Google's Gemini model (`/chat`)
- **ChatGPT Integration**: Alternative AI powered by OpenAI's GPT models (`/gpt`)

### Social Media Downloads
Download videos from **6 platforms** without watermarks:
- TikTok
- Twitter/X
- LinkedIn
- Facebook
- Pinterest
- Instagram (Reels & Posts)
- YouTube (wip)
- Snapchat (wip)

Just send the URL directly or use `/get <url>` - supports up to **150MB** files!

### Multilingual Support
- **Auto Language Detection**: Detects user language from phone number (100+ countries)
- **Translation**: Translate text to any language (`/translate <lang-code> <text>`)
- **Available Languages**: View with `/langlist`
- **Supported Bot Languages**: English, French (automatic based on user location)

### Fun & Utilities
- **Memes**: Random memes (`/meme`)
- **Jokes**: Two-part or single-line jokes (`/joke`)
- **Weather**: Current weather for any city (`/meteo <city>`)
- **Ping**: Check bot latency (`/ping`)
- **Help**: Interactive command guide (`/help`)
- **Onboarding**: Tutorial video (`/onboard`)

### CRM & Campaign Management
**Admin Panel** at `/admin`:
- **Contact Tracking**: Auto-save all bot users with language detection
- **Bulk Messaging**: Send campaigns to filtered contacts
- **Message Templates**: Save and reuse message templates
- **Schedule Campaigns**: Send immediately or schedule for later
- **Analytics Dashboard**: Track contacts, interactions, and campaign performance
- **Language Filtering**: Filter contacts by English, French, or Other

---

## Commands Reference

> **Note**: In development mode, use `!` prefix instead of `/` (e.g., `!help` instead of `/help`)

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Display all available commands | `/help` |
| `/ping` | Check bot responsiveness and latency | `/ping` |
| `/onboard` | Get tutorial video | `/onboard` |
| `/chat <message>` | Chat with Gemini AI | `/chat Tell me a story` |
| `/gpt <message>` | Chat with ChatGPT | `/gpt Explain quantum physics` |
| **Voice Messages** | Send audio for AI voice chat | Just send a voice message |
| `/get <url>` | Download social media video | `/get https://tiktok.com/...` |
| **Direct URL** | Just paste the URL | `https://instagram.com/...` |
| `/translate <lang> <text>` | Translate to any language | `/translate es Hello world` |
| `/langlist` | View available languages | `/langlist` |
| `/meteo <city>` | Get current weather | `/meteo Paris` |
| `/meme` | Get random meme | `/meme` |
| `/joke` | Get random joke | `/joke` |

---

## Quick Start

### Option 1: Docker (Recommended)

#### Quick Test with DockerHub
```bash
docker pull yaasiinayeva/whatsbot:latest
docker run -d -p 3000:3000 yaasiinayeva/whatsbot
```

#### From Source with Docker Compose
```bash
git clone https://github.com/yaasiin-ayeva/WhatsBot.git
cd WhatsBot
cp .env.example .env
# Edit .env with your API keys (see Configuration section)

docker-compose up --build -d

# Access at http://localhost:3000
```

**Scan the QR code** on the web interface and you're ready!

---

### Option 2: PM2 Production Deployment

Perfect for VPS/server deployments with auto-restart and monitoring.

> **Important**: Requires Chrome/Chromium browser installed locally


```bash
git clone https://github.com/yaasiin-ayeva/WhatsBot.git
cd WhatsBot
npm install
cp .env.example .env
# Edit .env with your API keys

npm install pm2 -g

# Build and start
npm run pm2:start

# Access at http://localhost:3000
```

---

### Option 3: Local Development

> **Important**: Requires Chrome/Chromium browser installed locally

```bash
npm install
cp .env.example .env
# Edit .env - MUST set PUPPETEER_EXECUTABLE_PATH to your Chrome binary

npm run dev

# Access at http://localhost:3000
```

**Chrome/Chromium Paths**:
- **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux**: `/usr/bin/chromium` or `/usr/bin/google-chrome`
- **Windows**: `C:\Program Files\Google\Chrome\Application\chrome.exe`

---

## Configuration

### Required Environment Variables

Create a `.env` file from the template:
```bash
cp .env.example .env
```

#### Essential Settings
```bash
# Environment
ENV=production                      # or development (changes command prefix)
PORT=3000

# Browser (Required for local deployment)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

#### AI Services
```bash
# Google Gemini AI (Primary chatbot)
GEMINI_API_KEY=your_key_here
# Get from: https://aistudio.google.com/app/apikey

# OpenAI ChatGPT (Alternative chatbot)
CHAT_GPT_PROJECT_ID=your_project_id
CHAT_GPT_ORG_ID=your_org_id
CHAT_GPT_API_KEY=your_api_key
# Get from: https://platform.openai.com/api-keys
```

#### Speech Services
```bash
# AssemblyAI (Speech-to-Text for voice messages)
ASSEMBLYAI_API_KEY=your_key_here
# Get from: https://www.assemblyai.com/docs

# Speechify (Text-to-Speech for audio responses)
SPEECHIFY_API_KEY=your_key_here
# Get from: https://console.sws.speechify.com/api-keys
```

#### Other Services
```bash
# Weather API
OPENWEATHERMAP_API_KEY=your_key_here
# Get from: https://www.weatherapi.com/my/

# Database & Authentication
MONGODB_URI=mongodb://localhost:27017/whatsbot
JWT_SECRET=your_secret_here

# Redis (Optional - for caching)
REDIS_URL=redis://localhost:6379
REDIS_PORT=6379
```

---

## Admin Panel Setup

### 1. Create Admin User
```bash
npm run create-admin
# Follow prompts to enter username and password
```

### 2. Access Admin Panel
Navigate to: `http://localhost:3000/admin`

### 3. Admin Features
- **Dashboard**: View total contacts, language breakdown, statistics
- **Contact Management**: Search, filter (by language), export contacts
- **Campaign Manager**: Create and schedule bulk messages
- **Template Manager**: Save reusable message templates
- **Campaign Analytics**: Track sent/failed messages

**API Endpoints** (protected with JWT):
```
POST /crm/auth/login          # Login
GET  /crm/contacts            # List contacts
POST /crm/campaigns           # Create campaign
GET  /crm/campaigns           # List campaigns
POST /crm/templates           # Create template
GET  /crm/templates           # List templates
POST /crm/send-message        # Send individual message
```

---

## 📁 Project Structure

```
WhatsBot/
├── src/
│   ├── index.ts              # Entry point with error handlers
│   ├── bot.manager.ts        # WhatsApp bot core logic
│   ├── commands/             # All bot commands
│   │   ├── chat.command.ts   # Gemini AI
│   │   ├── gpt.command.ts    # ChatGPT
│   │   ├── get.command.ts    # Social media downloader
│   │   ├── translate.command.ts
│   │   ├── meteo.command.ts
│   │   ├── meme.command.ts
│   │   ├── joke.command.ts
│   │   └── ...
│   ├── configs/              # Configuration files
│   ├── utils/                # Utility functions
│   │   ├── get.util.ts       # Video downloaders
│   │   ├── gemini.util.ts    # Gemini AI client
│   │   ├── chat-gpt.util.ts  # ChatGPT client
│   │   ├── i18n.util.ts      # Internationalization
│   │   └── ...
│   ├── crm/                  # CRM system
│   │   ├── models/           # Database models
│   │   ├── api/              # CRM API routes
│   │   └── middlewares/      # Auth middleware
│   ├── crons/                # Scheduled tasks
│   │   ├── cleanup.cron.ts   # File cleanup (hourly)
│   │   └── campaign.cron.ts  # Campaign scheduler
│   └── views/                # EJS templates
│       ├── index.ejs         # Main dashboard
│       ├── qr.ejs            # QR scanner
│       └── admin.ejs         # CRM panel
├── public/
│   ├── downloads/            # Temporary file storage
│   └── botavatar.gif         # Bot avatar
├── logs/                     # Application logs
├── .bot/                     # yt-dlp binary
├── ecosystem.config.js       # PM2 configuration
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker Compose
└── package.json              # Dependencies
```

---

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 20+ with TypeScript
- **WhatsApp**: whatsapp-web.js (custom fork)
- **Web Framework**: Express.js + EJS templating
- **Database**: MongoDB with Mongoose
- **Process Manager**: PM2

### AI & Speech
- **AI Models**: Google Gemini AI, OpenAI GPT
- **Speech-to-Text**: AssemblyAI
- **Text-to-Speech**: Speechify
- **Language Detection**: langdetect

### Media Processing
- **Video Download**: yt-dlp, btch-downloader
- **Video Processing**: FFmpeg (fluent-ffmpeg)
- **Browser Automation**: Puppeteer

### Other Services
- **Translation**: Google Translate API
- **Weather**: WeatherAPI.com
- **Memes**: meme-api.com
- **Jokes**: jokeapi.dev

---

### Health Check
```bash
curl http://localhost:3000/health
```

**Response**:
```json
{
  "status": "healthy",
  "clientReady": true,
  "uptime": 3600,
  "memoryUsage": {...},
  "qrScanned": true,
  "botContact": "wa.me/...",
  "version": "20.19.0"
}
```

---

## Disclaimer

> **Important**: This bot uses an unofficial WhatsApp API (whatsapp-web.js). WhatsApp does not allow bots or unofficial clients on their platform, especially for spam. **Use at your own risk** - your number could be blocked.

**Recommendations**:
- Use a separate phone number for the bot
- Don't spam users
- Respect rate limits
- Monitor for suspicious activity alerts

---

## Roadmap & TODO

### Completed
- [x] i18n support (English, French)
- [x] 100+ translation languages
- [x] CRM system with campaign management
- [x] PM2 production deployment
- [x] Automatic file cleanup
- [x] Crash protection & error handlers
- [x] Voice message support
- [x] Docker deployment

### In Progress
- [ ] Social media downloads (6/8 platforms done)
- [ ] Queue system for concurrent downloads
- [ ] Refactor to use whisper-node instead of AssemblyAI
- [ ] Support for any file type downloads (not just videos)

### Planned
- [ ] REST API for bot control
- [ ] Web-based command tester
- [ ] Analytics dashboard improvements
- [ ] More AI model integrations
- [ ] Plugin system for custom commands
- [ ] Multi-language admin panel
- [ ] Webhook support for external integrations

**Open to suggestions!** Submit feature requests via [GitHub Issues](https://github.com/yaasiin-ayeva/WhatsBot/issues). Please read our [Contributing Guide](CONTRIBUTING.md) before making a pull request.

---

## Support

### Getting Help
- Report bugs via [GitHub Issues](https://github.com/yaasiin-ayeva/WhatsBot/issues)

### Common Issues
1. **Bot won't start**: Check `PUPPETEER_EXECUTABLE_PATH` in `.env`
2. **QR code not showing**: Check port 3000 is not in use
3. **Downloads failing**: Update yt-dlp binary or check API keys
4. **Memory errors**: Check PM2 memory limits in `ecosystem.config.js`

---

## License

This project is licensed under the  [MIT License](LICENSE).

## Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API wrapper
- [Google Gemini](https://ai.google.dev/) - AI model
- [OpenAI](https://openai.com/) - ChatGPT API
- [AssemblyAI](https://www.assemblyai.com/) - Speech-to-text
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Video downloader
- All [contributors](https://github.com/yaasiin-ayeva/WhatsBot/graphs/contributors) who helped improve this project

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yaasiin-ayeva/WhatsBot&type=date&legend=top-left)](https://www.star-history.com/#yaasiin-ayeva/WhatsBot&type=date&legend=top-left)

---

<div align="center">
    <p>Made with ❤️ by <a href="https://github.com/yaasiin-ayeva">Yaasiin Ayeva</a> x <a href="https://github.com/djabiridrissou">Djabir Idrissou</a></p>
    <p>
        <a href="https://github.com/yaasiin-ayeva/WhatsBot">⭐ Star this repo</a> •
        <a href="https://github.com/yaasiin-ayeva/WhatsBot/fork">🔀 Fork</a> •
        <a href="https://github.com/yaasiin-ayeva/WhatsBot/issues">🐛 Report Bug</a> •
        <a href="https://github.com/yaasiin-ayeva/WhatsBot/issues">💡 Request Feature</a>
    </p>
    <p>
        <strong>If you find this project useful, please consider giving it a ⭐ star!</strong>
    </p>
</div>
