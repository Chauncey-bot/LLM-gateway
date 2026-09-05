FROM node:22-alpine
WORKDIR /app
COPY quota-gateway/package*.json ./
RUN npm ci --omit=dev
COPY quota-gateway/*.mjs ./
COPY quota-gateway/scripts ./scripts
COPY zhisales-pay-service/catalog.json ./plan-catalog.json
ENV PLAN_CATALOG_PATH=/app/plan-catalog.json
EXPOSE 18193
CMD ["npm", "start"]
