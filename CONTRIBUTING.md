# How to contribute to this project

### 1. Fork this repository

Visit the [repository](https://github.com/yaasiin-ayeva/WhatsBot) on github and fork it as shown below

![fork](https://github.com/user-attachments/assets/5c7b5ea2-f943-4876-87cb-c14b3b6a3ddf)

### 2. Clone your new repository to your system.

### 3. Create a new branch 

### 4. Commit changes and push the new branch.

### 5. Create a pull request and submit it.

### ps : This is the basic project structure

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
````
