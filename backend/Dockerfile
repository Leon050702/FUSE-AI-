# FUSE-AI backend — runs the Node/Express server AND serves the frontend.
FROM node:20-alpine

WORKDIR /app/backend

# Install dependencies first (cached unless package.json changes).
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy the backend source.
COPY backend/ ./

# Copy the frontend so server.js can serve it (../frontend relative to backend).
COPY frontend/ ../frontend/

EXPOSE 3001

CMD ["node", "server.js"]
