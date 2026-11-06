// Replaced with a real build id by the GitHub Pages workflow on every push.
const RAW = '__BUILD__';
export const BUILD = RAW.startsWith('__') ? 'dev' : RAW;
