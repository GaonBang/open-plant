function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!ok) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!ok) {
    const log = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

export function requireUniformLocation(gl: WebGL2RenderingContext, program: WebGLProgram, uniformName: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, uniformName);
  if (!location) {
    throw new Error(`Failed to get uniform location: ${uniformName}`);
  }
  return location;
}

export function requireWebGL2(canvas: HTMLCanvasElement, options?: { preserveDrawingBuffer?: boolean }): WebGL2RenderingContext {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
    powerPreference: "high-performance",
  });

  if (!context) {
    throw new Error("WebGL2 is not available.");
  }

  return context;
}
