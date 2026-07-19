import { defineMcp } from "@lovable.dev/mcp-js";
import calculateIvaTool from "./tools/calculate-iva";
import cartTotalTool from "./tools/cart-total";
import formatCopTool from "./tools/format-cop";
import validateNitTool from "./tools/validate-nit";

export default defineMcp({
  name: "pos-lite-mcp",
  title: "POS Lite MCP",
  version: "0.1.0",
  instructions:
    "Utilidades sin estado para el POS Lite (Colombia). Los datos de productos, ventas y clientes viven en el navegador de cada dispositivo (IndexedDB) y no son accesibles desde MCP. Estas herramientas ayudan con cálculos de cartera: formatear COP, calcular IVA, validar NIT colombiano y totalizar un carrito de venta.",
  tools: [formatCopTool, calculateIvaTool, validateNitTool, cartTotalTool],
});