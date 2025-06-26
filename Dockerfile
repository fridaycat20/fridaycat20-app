# Use Node.js base image with security updates
FROM node:24-alpine

# Install system dependencies including fonts
RUN apk update && apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    wget \
    unzip \
    && wget -O /tmp/noto-cjk.zip https://github.com/googlefonts/noto-cjk/releases/download/Sans2.004/04_NotoSansCJK-OTF.zip \
    && mkdir -p /usr/share/fonts/opentype/noto \
    && unzip /tmp/noto-cjk.zip -d /usr/share/fonts/opentype/noto/ \
    && fc-cache -fv \
    && rm /tmp/noto-cjk.zip \
    && apk del wget unzip

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]