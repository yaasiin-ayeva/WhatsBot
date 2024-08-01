<div align="center">
    <h1>
        WhatsBot 
        <a href="https://yaasiin-dev.vercel.app/" target="_blank">
            <img src="https://vercelbadge.vercel.app/api/yaasiin-ayeva/yaasiin.dev" alt="Vercel deployment status">
        </a>
    </h1>
    <img src="public/botavatar.gif" alt="Preview" width="40%">
    <p>
        Simple WhatsApp bot from unofficial Whatsapp API, built in NodeJS   &amp;  TypeScript, uses Gemini   &amp;   ChatGPT APIs for Completion, and having many cool features. You can talk to the bot in voice messages, the bot will transcribe and respond. 🤖
    </p>
</div>

### Try it here !

[WhatsBot Playground](https://chat.whatsapp.com/LafMN793Hj9BBn3rOAe5CI)

### Getting Started

Runninng Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Make sure the environment variables are set before starting the server

A QR code will be generated in the terminal for you to scan.
Kindly scan it with your whatsapp app and you're all set! 🎉


In development mode, your bot prefix will be automatically set to `!`

### Configurations

You can change the configurations in `src/configs/app.config.ts`

For third-party services used in the bot, kindly get the API keys and set them correctly. These are the one used in the bot, skipping them could lead to limitations :

- [Gemini](https://gemini.com/api) : AI for text completion
- [ChatGPT](https://platform.openai.com/api-keys) : ChatGPT for text completion
- [Open Weather API](https://www.weatherapi.com/my/) : Provides weather information
- [Speechify](https://console.sws.speechify.com/api-keys) : Text-to-Speech tool used in this project
- [AssemblyAI](https://www.assemblyai.com/docs) : Speech to text tool used in this project 


### Features

1. AI Completion with Gemini AI
```
!chat [text] - Send a message to the AI
```

2. AI Completion with ChatGPT
```
!gpt [text] - Send a message to the AI
```

3. Get
```
!get <url> - Download file from a social media (Tiktok, Twitter, Instagram, Facebook, Pinterest, Youtube) without watermark
```

4. Memes
```
!meme - Get a random meme
```

5. Jokes
```
!joke - Get a random joke
```

6. Help
```
!help - Get help
```

7. Ping
```
!ping - Ping the bot
```

8. Language Translation
```
!translate [language-code] [text] - Translate text to the specified language
```

9. Weather
```
!meteo <city> - Get current weather for a city
```

<!-- ### Project Structure
````	
src/
│
├── commands/         # Contains command modules
│   ├── chat.command.ts
│   ├── gpt.command.ts
│   ├── help.command.ts
│   ├── index.ts
│   ├── langlist.command.ts
│   ├── meme.command.ts
│   ├── joke.command.ts
│   ├── ping.command.ts
│   └── translate.command.ts
│
├── configs/          # Configuration files
│   ├── client.config.ts
│   ├── env.config.ts
│   └── logger.config.ts
│
├── utils/            # Utility functions
│   ├── chat-gpt.util.ts
│   ├── gemini.util.ts
│   └── translate.util.ts
│
├── public/           # Public assets
│   └── index.png     # Bot preview image
│
└── index.ts          # Main entry point
```` -->

### Contributing

If you'd like to contribute, please read the [Contributing Guide](CONTRIBUTING.md)

## License

[MIT](LICENSE)
