// Utilidades compartidas por las herramientas de QA.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const URL_BASE = process.env.ZAINO_URL || 'http://localhost:8000/';

const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default'];
const SOFT_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

async function webglInfo(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
  } finally {
    await page.close();
  }
}

// Abre Chromium con GPU si hay; si WebGL no funciona, reintenta con SwiftShader (software).
export async function lanzar() {
  let browser = await chromium.launch({ args: GPU_ARGS });
  let gl = await webglInfo(browser).catch(() => null);
  if (!gl) {
    await browser.close();
    browser = await chromium.launch({ args: SOFT_ARGS });
    gl = await webglInfo(browser).catch(() => null);
    if (!gl) { await browser.close(); throw new Error('WebGL no disponible ni con GPU ni con SwiftShader'); }
  }
  browser.webgl = gl;
  return browser;
}

// Página nueva que junta errores y advertencias de consola.
export async function nuevaPagina(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: opts.ancho || 1280, height: opts.alto || 720 },
    deviceScaleFactor: 1,
    ...(opts.userAgent ? { userAgent: opts.userAgent, isMobile: true, hasTouch: true } : {})
  });
  const page = await context.newPage();
  page.mensajes = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.mensajes.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => page.mensajes.push(`[pageerror] ${e.message}`));
  return page;
}

// Carga el sitio y espera a que el cuerpo del caballo esté construido (window.__debug.ready).
export async function abrirListo(page, url = URL_BASE) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__debug && window.__debug.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__debug.ready);
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

export function asegurarCarpeta(archivo) {
  mkdirSync(dirname(resolve(archivo)), { recursive: true });
}
