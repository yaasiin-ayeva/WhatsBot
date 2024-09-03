FROM node:slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    nano \
    zip unzip \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    chromium \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production \
    && npm cache clean --force

COPY . .
# RUN cp /app/.env.example /app/.env

EXPOSE 3000

CMD ["npm", "start"]