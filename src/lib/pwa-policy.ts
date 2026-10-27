export function allowAppServiceWorker(production: boolean, hostname: string, framed: boolean, search: string) {
  const host = hostname.toLowerCase();
  const previewDomain = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  const previewLabel = /^(?:(?:id-preview|preview)(?:-[a-z0-9]+)?--.+|project--.+-dev)$/.test(host.split(".")[0] ?? "");
  const internal = /(^|\.)(lovableproject\.com|lovableproject-dev\.com|beta\.lovable\.dev)$/.test(host);
  return production && !framed && !(previewDomain && previewLabel) && !internal && new URLSearchParams(search).get("sw") !== "off";
}