FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY subscription-fulfillment.mjs ./
COPY catalog.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
