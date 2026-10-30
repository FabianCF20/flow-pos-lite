export function allowAppServiceWorker(
  production: boolean,
  hostname: string,
  framed: boolean,
  search: string,
) {
  const host = hostname.toLowerCase();
  const previewLabel = /^(?:(?:id-preview|preview)(?:-[a-z0-9]+)?--.+|project--.+-dev)$/.test(
    host.split(".")[0] ?? "",
  );
  return production && !framed && !previewLabel && new URLSearchParams(search).get("sw") !== "off";
}
