<body>
    <div align="center">
        <h1>
            WhatsBot 
            <a href="https://yaasiin-dev.vercel.app/" target="_blank">
                <img src="https://vercelbadge.vercel.app/api/yaasiin-ayeva/yaasiin.dev" alt="Vercel deployment status" style="vertical-align: middle;">
            </a>
        </h1>
        <img src="public/botavatar.gif" alt="Preview" width="40%" style="max-width: 300px; border-radius: 8px;">
        <p>
            Simple WhatsApp bot from unofficial WhatsApp API, built in NodeJS &amp; TypeScript, using Gemini &amp; ChatGPT APIs for completion, with many cool features. You can interact with the bot using voice messages, and it will transcribe and respond. 🤖
        </p>
        <!-- <p>
            Try it here: <a href="https://wa.me/qr/SBHRATABRAZVA1" target="_blank">WhatsBot Playground</a> or scan the QR code below:
        </p>
        <br>
        <img src="public/qr.jpg" width="35%" alt="WhatsApp QR Code" style="margin-top: 20px;"> -->
    </div>
</body>


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

### Configurations

You can change the configurations in `src/configs/app.config.ts`

For third-party services used in the bot, kindly get the API keys and set them correctly. These are the one used in the bot, skipping them could lead to limitations :

- [Gemini](https://aistudio.google.com/app/apikey) : AI for text completion
- [ChatGPT](https://platform.openai.com/api-keys) : ChatGPT for text completion
- [Open Weather API](https://www.weatherapi.com/my/) : Provides weather information
- [Speechify](https://console.sws.speechify.com/api-keys) : Text-to-Speech tool used in this project
- [AssemblyAI](https://www.assemblyai.com/docs) : Speech to text tool used in this project 


### Features

In development mode, your bot prefix will be automatically set to `!`. Meanning that you can use `!help` to get the list of commands instead of `/help`.

1. AI Completion with Gemini AI
```
/chat [text] - Send a message to the AI
```

2. AI Completion with ChatGPT (Not available in the playground environment)
```
/gpt [text] - Send a message to the AI
```

3. Get
```
/get <url> - Download file from a social media (Tiktok, Twitter, Instagram, Facebook, Pinterest, Youtube) without watermark
```

4. Memes
```
/meme - Get a random meme
```

5. Jokes
```
/joke - Get a random joke
```

6. Help
```
/help - Get help
```

7. Ping
```
/ping - Ping the bot
```

8. Language Translation
```
/translate [language-code] [text] - Translate text to the specified language
```

9. Weather
```
/meteo <city> - Get current weather for a city
```

### Contributing

If you'd like to contribute, please read the [Contributing Guide](CONTRIBUTING.md)

## License

[MIT](LICENSE)
