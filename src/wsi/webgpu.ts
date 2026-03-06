export interface WebGpuCapabilities {
	supported: boolean;
	adapterName?: string;
	features: string[];
	limits?: {
		maxStorageBufferBindingSize: number;
		maxComputeInvocationsPerWorkgroup: number;
		maxComputeWorkgroupSizeX: number;
	};
}

interface NavigatorGpuLike {
	requestAdapter: () => Promise<GpuAdapterLike | null>;
}

interface GpuAdapterLike {
	info?: {
		description?: string;
		vendor?: string;
	};
	features: Iterable<string>;
	limits: {
		maxStorageBufferBindingSize: number;
		maxComputeInvocationsPerWorkgroup: number;
		maxComputeWorkgroupSizeX: number;
	};
	requestDevice: () => Promise<GpuDeviceLike>;
}

interface GpuBufferLike {
	destroy: () => void;
	mapAsync: (mode: number) => Promise<void>;
	getMappedRange: () => ArrayBuffer;
	unmap: () => void;
}

interface GpuComputePassLike {
	setPipeline: (pipeline: GpuComputePipelineLike) => void;
	setBindGroup: (index: number, bindGroup: unknown) => void;
	dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
	end: () => void;
}

interface GpuCommandEncoderLike {
	beginComputePass: () => GpuComputePassLike;
	copyBufferToBuffer: (
		source: GpuBufferLike,
		sourceOffset: number,
		destination: GpuBufferLike,
		destinationOffset: number,
		size: number,
	) => void;
	finish: () => unknown;
}

interface GpuQueueLike {
	writeBuffer: (
		buffer: GpuBufferLike,
		bufferOffset: number,
		data: ArrayBufferView | ArrayBufferLike,
		dataOffset?: number,
		size?: number,
	) => void;
	submit: (commands: unknown[]) => void;
}

interface GpuComputePipelineLike {
	readonly _brand?: "GpuComputePipelineLike";
}

interface GpuBindGroupLayoutLike {
	readonly _brand?: "GpuBindGroupLayoutLike";
}

interface GpuDeviceLike {
	limits: {
		maxStorageBufferBindingSize: number;
	};
	queue: GpuQueueLike;
	createBindGroupLayout: (descriptor: unknown) => GpuBindGroupLayoutLike;
	createPipelineLayout: (descriptor: unknown) => unknown;
	createShaderModule: (descriptor: { code: string }) => unknown;
	createComputePipeline: (descriptor: unknown) => GpuComputePipelineLike;
	createBuffer: (descriptor: { size: number; usage: number }) => GpuBufferLike;
	createBindGroup: (descriptor: unknown) => unknown;
	createCommandEncoder: () => GpuCommandEncoderLike;
}

interface WebGpuContext {
	device: GpuDeviceLike;
	pipeline: GpuComputePipelineLike;
	bindGroupLayout: GpuBindGroupLayoutLike;
}

let contextPromise: Promise<WebGpuContext | null> | null = null;

const BBOX_PREFILTER_SHADER = `
struct Params {
  pointCount: u32,
  boundsCount: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read> bounds: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outputMask: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.pointCount) {
    return;
  }

  let p = positions[i];
  var inside: u32 = 0u;
  for (var bi: u32 = 0u; bi < params.boundsCount; bi = bi + 1u) {
    let b = bounds[bi];
    if (p.x >= b.x && p.x <= b.z && p.y >= b.y && p.y <= b.w) {
      inside = 1u;
      break;
    }
  }
  outputMask[i] = inside;
}
`;

function hasWebGpu(): boolean {
	if (typeof navigator === "undefined") return false;
	const nav = navigator as Navigator & { gpu?: unknown };
	return typeof nav.gpu === "object" && nav.gpu !== null;
}

function getNavigatorGpu(): NavigatorGpuLike | null {
	if (!hasWebGpu()) return null;
	const nav = navigator as Navigator & { gpu?: unknown };
	const gpu = nav.gpu;
	if (!gpu || typeof gpu !== "object") return null;
	const candidate = gpu as Partial<NavigatorGpuLike>;
	if (typeof candidate.requestAdapter !== "function") return null;
	return candidate as NavigatorGpuLike;
}

const GPU_SHADER_STAGE_COMPUTE =
	(globalThis as { GPUShaderStage?: { COMPUTE?: number } }).GPUShaderStage
		?.COMPUTE ?? 0x4;
const GPU_BUFFER_USAGE_STORAGE =
	(globalThis as { GPUBufferUsage?: { STORAGE?: number } }).GPUBufferUsage
		?.STORAGE ?? 0x80;
const GPU_BUFFER_USAGE_COPY_DST =
	(globalThis as { GPUBufferUsage?: { COPY_DST?: number } }).GPUBufferUsage
		?.COPY_DST ?? 0x08;
const GPU_BUFFER_USAGE_COPY_SRC =
	(globalThis as { GPUBufferUsage?: { COPY_SRC?: number } }).GPUBufferUsage
		?.COPY_SRC ?? 0x04;
const GPU_BUFFER_USAGE_UNIFORM =
	(globalThis as { GPUBufferUsage?: { UNIFORM?: number } }).GPUBufferUsage
		?.UNIFORM ?? 0x40;
const GPU_BUFFER_USAGE_MAP_READ =
	(globalThis as { GPUBufferUsage?: { MAP_READ?: number } }).GPUBufferUsage
		?.MAP_READ ?? 0x01;
const GPU_MAP_MODE_READ =
	(globalThis as { GPUMapMode?: { READ?: number } }).GPUMapMode?.READ ?? 0x01;

export async function getWebGpuCapabilities(): Promise<WebGpuCapabilities> {
	const navGpu = getNavigatorGpu();
	if (!navGpu) {
		return { supported: false, features: [] };
	}
	const adapter = await navGpu.requestAdapter();
	if (!adapter) {
		return { supported: false, features: [] };
	}

	return {
		supported: true,
		adapterName: adapter.info?.description ?? adapter.info?.vendor ?? "unknown",
		features: Array.from(adapter.features),
		limits: {
			maxStorageBufferBindingSize: Number(
				adapter.limits.maxStorageBufferBindingSize,
			),
			maxComputeInvocationsPerWorkgroup: Number(
				adapter.limits.maxComputeInvocationsPerWorkgroup,
			),
			maxComputeWorkgroupSizeX: Number(adapter.limits.maxComputeWorkgroupSizeX),
		},
	};
}

async function getContext(): Promise<WebGpuContext | null> {
	if (contextPromise) return contextPromise;
	contextPromise = (async () => {
		const navGpu = getNavigatorGpu();
		if (!navGpu) return null;
		const adapter = await navGpu.requestAdapter();
		if (!adapter) return null;
		const device = await adapter.requestDevice();

		const bindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPU_SHADER_STAGE_COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 1,
					visibility: GPU_SHADER_STAGE_COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 2,
					visibility: GPU_SHADER_STAGE_COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 3,
					visibility: GPU_SHADER_STAGE_COMPUTE,
					buffer: { type: "uniform" },
				},
			],
		});

		const pipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			compute: {
				module: device.createShaderModule({ code: BBOX_PREFILTER_SHADER }),
				entryPoint: "main",
			},
		});

		return { device, pipeline, bindGroupLayout };
	})();

	return contextPromise;
}

function align(value: number, step: number): number {
	return Math.ceil(value / step) * step;
}

export async function prefilterPointsByBoundsWebGpu(
	positions: Float32Array,
	pointCount: number,
	bounds: Float32Array,
): Promise<Uint32Array | null> {
	const ctx = await getContext();
	if (!ctx) return null;

	const count = Math.max(0, Math.floor(pointCount));
	const boundsCount = Math.max(0, Math.floor(bounds.length / 4));
	if (count === 0 || boundsCount === 0) {
		return new Uint32Array(0);
	}

	const safePointCount = Math.min(count, Math.floor(positions.length / 2));
	if (safePointCount === 0) {
		return new Uint32Array(0);
	}

	const positionBytes = safePointCount * 2 * Float32Array.BYTES_PER_ELEMENT;
	const boundsBytes = boundsCount * 4 * Float32Array.BYTES_PER_ELEMENT;
	const outputBytes = safePointCount * Uint32Array.BYTES_PER_ELEMENT;

	const limit = Number(ctx.device.limits.maxStorageBufferBindingSize);
	if (positionBytes > limit || boundsBytes > limit || outputBytes > limit) {
		return null;
	}

	const positionsBuffer = ctx.device.createBuffer({
		size: align(positionBytes, 4),
		usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
	});
	const boundsBuffer = ctx.device.createBuffer({
		size: align(boundsBytes, 4),
		usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
	});
	const outputBuffer = ctx.device.createBuffer({
		size: align(outputBytes, 4),
		usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
	});
	const uniformBuffer = ctx.device.createBuffer({
		size: 16,
		usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
	});
	const readBuffer = ctx.device.createBuffer({
		size: align(outputBytes, 4),
		usage: GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_MAP_READ,
	});

	let readBufferMapped = false;
	try {
		ctx.device.queue.writeBuffer(
			positionsBuffer,
			0,
			positions.buffer,
			positions.byteOffset,
			positionBytes,
		);
		ctx.device.queue.writeBuffer(
			boundsBuffer,
			0,
			bounds.buffer,
			bounds.byteOffset,
			boundsBytes,
		);
		ctx.device.queue.writeBuffer(
			uniformBuffer,
			0,
			new Uint32Array([safePointCount, boundsCount, 0, 0]),
		);

		const bindGroup = ctx.device.createBindGroup({
			layout: ctx.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: positionsBuffer } },
				{ binding: 1, resource: { buffer: boundsBuffer } },
				{ binding: 2, resource: { buffer: outputBuffer } },
				{ binding: 3, resource: { buffer: uniformBuffer } },
			],
		});

		const commandEncoder = ctx.device.createCommandEncoder();
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(ctx.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(safePointCount / 256));
		pass.end();

		commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBytes);
		ctx.device.queue.submit([commandEncoder.finish()]);

		await readBuffer.mapAsync(GPU_MAP_MODE_READ);
		readBufferMapped = true;
		const mapped = readBuffer.getMappedRange();
		return new Uint32Array(mapped.slice(0));
	} finally {
		if (readBufferMapped) {
			try {
				readBuffer.unmap();
			} catch {
				// Already unmapped or map failed after resolving.
			}
		}
		positionsBuffer.destroy();
		boundsBuffer.destroy();
		outputBuffer.destroy();
		uniformBuffer.destroy();
		readBuffer.destroy();
	}
}
