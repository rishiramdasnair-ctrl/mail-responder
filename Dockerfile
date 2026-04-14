FROM node:22-alpine

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts

# Install dependencies (skip playwright browser download)
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile

# Build the project
RUN pnpm run build

# Start the API server
CMD ["node", "./artifacts/api-server/dist/index.mjs"]
