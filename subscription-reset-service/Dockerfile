FROM node:20-alpine

WORKDIR /app

COPY subscription-reset-service/package*.json ./
RUN npm ci --omit=dev

COPY subscription-reset-service/server.mjs ./
COPY subscription-reset-service/plan-policy.mjs ./
COPY zhisales-pay-service/catalog.json ./plan-catalog.json
ENV PLAN_CATALOG_PATH=/app/plan-catalog.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
