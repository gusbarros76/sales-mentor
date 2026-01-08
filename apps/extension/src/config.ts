// Configuration for the extension
// This will be replaced during build based on environment

interface Config {
  backendUrl: string;
  wsUrl: string;
}

// Development config (default)
let config: Config = {
  backendUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080'
};

// Check if we're in production build
// The build process will replace this with actual production URL
if (import.meta.env.VITE_BACKEND_URL) {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const protocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
  const wsUrl = backendUrl.replace(/^https?/, protocol);

  config = {
    backendUrl,
    wsUrl
  };
}

export default config;
