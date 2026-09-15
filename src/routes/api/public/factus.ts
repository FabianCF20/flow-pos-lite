import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy para la API de Factus (facturación electrónica DIAN — Colombia).
 * Docs: https://developers.factus.com.co/
 *
 * El cliente envía credenciales + acción; este handler obtiene el token
 * (OAuth2 password grant) y reenvía la petición. Corre en el servidor para
 * evitar CORS y para no exponer llamadas directas desde el navegador.
 *
 * Acciones soportadas:
 *  - auth          → solo valida credenciales
 *  - invoice       → POST /v1/bills/validate           (factura de venta)
 *  - credit_note   → POST /v1/credit-notes/validate    (nota crédito / devolución)
 *  - debit_note    → POST /v1/debit-notes/validate     (nota débito)
 *  - get           → GET  {path} (catálogos, listados, consultas)
 */

const POST_ACTIONS: Record<string, string> = {
  invoice: "/v1/bills/validate",
  credit_note: "/v1/credit-notes/validate",
  debit_note: "/v1/debit-notes/validate",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/factus")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*" };
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400, headers: cors });
        }
        const { env, auth, payload, testAuth } = body ?? {};
        let action: string = body?.action ?? (testAuth ? "auth" : "invoice");
        const path: string | undefined = body?.path;

        if (!auth?.email || !auth?.password || !auth?.client_id || !auth?.client_secret) {
          return Response.json({ error: "Credenciales de Factus incompletas" }, { status: 400, headers: cors });
        }
        const baseUrl = env === "production"
          ? "https://api.factus.com.co"
          : "https://api-sandbox.factus.com.co";

        // 1) token
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
            {
              error: tokenJson?.message || tokenJson?.error_description || tokenJson?.error || "Autenticación con Factus falló",
              raw: tokenJson,
            },
            { status: 401, headers: cors },
          );
        }
        const token = tokenJson.access_token as string;

        if (action === "auth") {
          return Response.json({ ok: true }, { headers: cors });
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        // 2a) consultas GET (catálogos, listados, PDF/XML en base64)
        if (action === "get") {
          if (!path || !path.startsWith("/v1/")) {
            return Response.json({ error: "Ruta no permitida" }, { status: 400, headers: cors });
          }
          try {
            const res = await fetch(`${baseUrl}${path}`, { headers });
            const json: any = await res.json().catch(() => ({}));
            if (!res.ok) {
              return Response.json(
                { error: json?.message || json?.error || `Factus HTTP ${res.status}`, raw: json },
                { status: res.status, headers: cors },
              );
            }
            return Response.json(json, { headers: cors });
          } catch (e: any) {
            return Response.json({ error: `Error de red con Factus: ${e?.message ?? e}` }, { status: 502, headers: cors });
          }
        }

        // 2b) emisión de documentos electrónicos
        const endpoint = POST_ACTIONS[action];
        if (!endpoint) {
          return Response.json({ error: `Acción no soportada: ${action}` }, { status: 400, headers: cors });
        }
        if (!payload) {
          return Response.json({ error: "Falta payload" }, { status: 400, headers: cors });
        }
        let docRes: Response;
        try {
          docRes = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
        } catch (e: any) {
          return Response.json({ error: `Error de red al emitir documento: ${e?.message ?? e}` }, { status: 502, headers: cors });
        }
        const docJson: any = await docRes.json().catch(() => ({}));
        if (!docRes.ok) {
          const detail = docJson?.errors
            ? Object.values(docJson.errors).flat().join(" · ")
            : undefined;
          return Response.json(
            { error: detail || docJson?.message || docJson?.error || `Factus HTTP ${docRes.status}`, raw: docJson },
            { status: docRes.status, headers: cors },
          );
        }
        return Response.json(docJson, { headers: cors });
      },
    },
  },
});
