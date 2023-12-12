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
npx ts-node --experimental-specifier-resolution=node --esm src/index.ts --host 192.168.1.23 --port 3002 --ssl-certfile oseh-dev.com.pem --ssl-keyfile oseh-dev.com-key.pem
```

Typically, requests would then be served at
[oseh-dev.com:3002](https://oseh-dev.com:3002), assuming you are injecting the
appropriate self-signed certificates and DNS remapping.

## License

2023 Oseh Inc, All Rights Reserved
