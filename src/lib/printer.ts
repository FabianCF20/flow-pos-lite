/**
 * Web Bluetooth ESC/POS printer (best-effort).
 * Works on Chrome for Android with thermal BT printers exposing a
 * writable characteristic. Falls back gracefully where unsupported.
 */

const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // common ESC/POS service
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

type BTDevice = any;
type BTChar = any;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

let cachedDevice: BTDevice | null = null;

export async function pickPrinter(): Promise<BTDevice> {
  if (!isBluetoothSupported()) throw new Error("Bluetooth no soportado en este dispositivo/navegador");
  const device: BTDevice = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  cachedDevice = device;
  return device;
}

async function getWritable(device: BTDevice): Promise<BTChar> {
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    const writable = chars.find((c: BTChar) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error("No se encontró característica de escritura");
}

function escposEncode(text: string): Uint8Array {
  const bytes: number[] = [];
  // Init
  bytes.push(0x1b, 0x40);
  // Encoding CP437
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    bytes.push(code < 128 ? code : 0x3f);
  }
  // Feed + cut
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(0x1d, 0x56, 0x00);
  return new Uint8Array(bytes);
}

export async function printText(text: string, device?: BTDevice) {
  const dev = device ?? cachedDevice ?? (await pickPrinter());
  const ch = await getWritable(dev);
  const data = escposEncode(text);
  // Send in chunks (BLE MTU ~ 20 bytes)
  const chunkSize = 180;
  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.slice(i, i + chunkSize);
    if (ch.properties.writeWithoutResponse) {
      await ch.writeValueWithoutResponse(slice);
    } else {
      await ch.writeValue(slice);
    }
  }
}