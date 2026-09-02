FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY payment-order-creation.mjs ./
COPY subscription-list.mjs ./
COPY subscription-duration.mjs ./
COPY subscription-fulfillment.mjs ./
COPY subscription-fulfillment-retry.mjs ./
COPY traffic-pack-state.mjs ./
COPY traffic-pack-plan-state.mjs ./
COPY traffic-pack-runtime.mjs ./
COPY catalog.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
