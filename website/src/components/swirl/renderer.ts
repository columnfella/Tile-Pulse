/**
 * WebGL port of the game's "Swirl · Deep" background shader, in the default theme's colours
 * (src/components/backgrounds/ShaderBackground.tsx in the app). All the maths
 * runs per pixel on the GPU; the CPU only sets a time uniform once per frame.
 * Works on a normal <canvas> or an OffscreenCanvas inside a Web Worker.
 */

import theme from '../../content/theme.json';

/** '#rrggbb' → GLSL vec3 (0–1). */
function glslColour(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => (x / 255).toFixed(3));
  return `vec3(${c.join(', ')})`;
}

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 iResolution;
uniform float iTime;

// Colours of the game's default theme, like its "Swirl · Deep" background
// (SWIRL_PALETTES.swirl_ocean: secondary, surfaceActive, background)
const vec3 C1 = ${glslColour(theme.colors.secondary)};
const vec3 C2 = ${glslColour(theme.colors.surfaceActive)};
const vec3 C3 = ${glslColour(theme.colors.background)};

const float TWIST = 2.6;        // how tightly the spiral winds
const float TURN_SPEED = 0.08;  // spiral rotation speed
const float FLOW_SPEED = 0.35;  // paint flow speed
const float SCALE = 2.4;        // size of the paint bands

vec2 rotate(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  // Centered, aspect-corrected coordinates (shorter side = 1). WebGL's y axis
  // points up, Skia's down: flip so the spiral turns the same way as in the game.
  vec2 fragCoord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);
  vec2 uv = (fragCoord - 0.5 * iResolution) / min(iResolution.x, iResolution.y);

  // 1. Spiral twist that slowly turns over time
  float r = length(uv);
  uv = rotate(uv, TWIST * r - iTime * TURN_SPEED);

  // 2. Domain warping: layered sine offsets
  float t = iTime * FLOW_SPEED;
  vec2 p = uv * SCALE;
  for (int i = 1; i <= 5; i++) {
    float k = float(i);
    p.x += 0.55 / k * sin(k * p.y + t + 0.9 * k);
    p.y += 0.55 / k * cos(k * p.x - 0.8 * t + 2.3 * k);
  }

  // 3. Map the warped field onto three colour bands
  float field = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 0.9 + 0.6 * sin(t * 0.5));
  vec3 col = mix(C3, C2, smoothstep(0.15, 0.5, field));
  col = mix(col, C1, smoothstep(0.55, 0.9, field));

  // Soft highlights on the brightest ridges
  float ridge = pow(smoothstep(0.82, 1.0, field), 2.0);
  col += ridge * 0.22;

  // Gentle vignette keeps the edges calm behind the text
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.1, r);

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SwirlRenderer {
  /** Set the drawing-buffer size in pixels. */
  resize(width: number, height: number): void;
  /** Draw one frame at `seconds`. */
  draw(seconds: number): void;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Swirl shader failed to compile:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/** Returns null when WebGL isn't available (the page then just keeps its plain background). */
export function createSwirlRenderer(canvas: AnyCanvas): SwirlRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power', // a background: prefer the battery-friendly GPU
  }) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One triangle that covers the whole screen
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'iResolution');
  const uTime = gl.getUniformLocation(program, 'iTime');

  return {
    resize(width, height) {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    },
    draw(seconds) {
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/** Drawing-buffer size for a CSS size: half resolution (it's a soft, blurry
 * pattern, so a quarter of the pixels looks the same), capped for huge screens. */
export function bufferSize(cssWidth: number, cssHeight: number) {
  const scale = 0.5;
  const maxPixels = 960 * 540;
  let w = cssWidth * scale;
  let h = cssHeight * scale;
  const k = Math.sqrt(maxPixels / Math.max(1, w * h));
  if (k < 1) {
    w *= k;
    h *= k;
  }
  return { width: Math.round(w), height: Math.round(h) };
}
