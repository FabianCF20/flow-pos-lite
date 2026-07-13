import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy for Factus API (facturación electrónica Colombia).
 * Docs: https://developers.factus.com.co/
 *
 * The client sends credentials + payload; this handler obtains a bearer
 * token from Factus (OAuth2 password grant) and forwards the invoice
 * validation request. Runs server-side to bypass browser CORS.
 */
export const Route = createFileRoute("/api/public/factus")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*" };
        let body: any;
        try { body = await request.json(); } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400, headers: cors });
        }
        const { env, auth, payload, testAuth } = body ?? {};
        if (!auth?.email || !auth?.password || !auth?.client_id || !auth?.client_secret) {
          return Response.json({ error: "Credenciales de Factus incompletas" }, { status: 400, headers: cors });
        }
        const baseUrl = env === "production"
          ? "https://api.factus.com.co"
          : "https://api-sandbox.factus.com.co";

        // 1) obtain token
        let tokenRes: Response;
        try {
          tokenRes = await fetch(`${baseUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              grant_type: "password",
              client_id: auth.client_id,
              client_secret: auth.client_secret,
              username: auth.email,
              password: auth.password,
            }),
          });
        } catch (e: any) {
          return Response.json({ error: `No se pudo contactar Factus: ${e?.message ?? e}` }, { status: 502, headers: cors });
        }
        const tokenJson: any = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson?.access_token) {
          return Response.json(
            { error: tokenJson?.message || tokenJson?.error_description || tokenJson?.error || "Autenticación con Factus falló", raw: tokenJson },
            { status: 401, headers: cors },
          );
        }
        const token = tokenJson.access_token as string;

        if (testAuth) {
          return Response.json({ ok: true }, { headers: cors });
        }

        if (!payload) {
          return Response.json({ error: "Falta payload" }, { status: 400, headers: cors });
        }

        // 2) validate/emit invoice
        let invRes: Response;
        try {
          invRes = await fetch(`${baseUrl}/v1/bills/validate`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
        } catch (e: any) {
          return Response.json({ error: `Error de red al emitir factura: ${e?.message ?? e}` }, { status: 502, headers: cors });
        }
        const invJson: any = await invRes.json().catch(() => ({}));
        if (!invRes.ok) {
          return Response.json(
            { error: invJson?.message || invJson?.error || `Factus HTTP ${invRes.status}`, raw: invJson },
            { status: invRes.status, headers: cors },
          );
        }
        return Response.json(invJson, { headers: cors });
      },
    },
  },
});