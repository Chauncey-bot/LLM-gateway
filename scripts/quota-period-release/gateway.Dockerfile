FROM zhisales-quota-gateway:quota-modes-20260905-2118
WORKDIR /app
COPY quota-gateway/*.mjs ./
COPY quota-gateway/ui ./ui
