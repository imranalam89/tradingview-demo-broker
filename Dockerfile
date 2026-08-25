# 24/7 Production Dockerfile for TradingView Demo Broker Engine
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package definition
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/trading_broker.db

# Start 24/7 trading engine
CMD ["node", "server/server.js"]
