# Oseh Frontend SSR Web

This server serves most logged-out pages handled by the app using react
server-side rendering combined with hydration. This aims for a minimal
dependency tree to avoid dealing with e.g. express updates. It provides improved
support for caching/compression/css/openapi compared to standard setups using
nextjs by ditching all streaming logic.

## Getting Started

First, install the dependencies:

```sh
git-lfs install
npm install
```

### Running

Update the following command with your internal host:

```sh
npx webpack --config webpack.config.js
node --enable-source-maps build/server/server.bundle.js --host 192.168.1.23 --port 3002 --ssl-certfile oseh-dev.com.pem --ssl-keyfile oseh-dev.com-key.pem
```

Typically, requests would then be served at
[oseh-dev.com:3002](https://oseh-dev.com:3002), assuming you are injecting the
appropriate self-signed certificates and DNS remapping. You will usually prefer
to connect at [oseh-dev.com:3001](https://oseh-dev.com:3001) so that assets loaded
from frontend-web are also served, using the dev proxy from frontend-web to handle
serving both from the same port
