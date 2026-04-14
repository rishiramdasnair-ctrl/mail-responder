# Use Node.js 22
FROM node:22-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Copy all source code
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts

# Install dependencies
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile

# Build the project
RUN pnpm run build

# Expose the port Railway needs
EXPOSE 8000

# Start the API server
CMD ["node", "./artifacts/api-server/dist/index.mjs"]
