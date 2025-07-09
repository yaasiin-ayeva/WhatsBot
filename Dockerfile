FROM node:slim

RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    nano \
    zip unzip \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    chromium \
    --no-install-recommends \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production \
    && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["npm", "start"]