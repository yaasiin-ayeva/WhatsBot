FROM node:slim

# Install ffmpeg to generate previews for videos
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install zip and unzip and also nano
RUN apt-get update && apt-get install -y nano zip unzip --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install fonts if using either chromium
RUN apt-get update  \
    && apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*;

# Install Chromium for puppeteer 
RUN apt-get update \
    && apt-get install -y chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*;

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]