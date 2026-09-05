FROM zhisales-pay-service:before-quota-modes-20260905
WORKDIR /app
COPY zhisales-pay-service/*.mjs ./
COPY zhisales-pay-service/catalog.json ./catalog.json
