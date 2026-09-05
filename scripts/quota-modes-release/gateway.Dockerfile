FROM zhisales-quota-gateway:before-quota-modes-20260905
WORKDIR /app
COPY quota-gateway/*.mjs ./
COPY zhisales-pay-service/catalog.json ./plan-catalog.json
ENV PLAN_CATALOG_PATH=/app/plan-catalog.json
