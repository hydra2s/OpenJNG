
class PNGChunk {
    constructor() {
        this.data = null;
        this.view = null;
        this.length = 0;
        this.crc32 = 0;
        this.name = "";
        this.slice = null;
    }

    compile() {
        var view = new DataView(this.slice.buffer, this.slice.byteOffset, this.length+4+4+4);
        view.setUint32(0, /*view.byteLength-4-4-4*/this.length, false);
        view.setUint8(4, this.name.charCodeAt(0));
        view.setUint8(5, this.name.charCodeAt(1));
        view.setUint8(6, this.name.charCodeAt(2));
        view.setUint8(7, this.name.charCodeAt(3));
        view.setUint32(this.length+4+4, this.crc32 = CRC32.buf(new Uint8Array(this.slice.buffer, this.slice.byteOffset+4, this.length+4)), false);
        return this;
    }
}

class DataReader {
    constructor(data) {
        this.data = data;
        this.offset = 0;
        this.chunks = [];
        this.signature = null;
        this.chunk = null;
    }
    
    readSignature() {
        this.signature = new Uint8Array(this.data, this.offset, 8);
        this.offset += 8;
        this.chunk = new PNGChunk();
    }

    readLength() {
        this.chunk.length = new DataView(this.data, this.offset, 4).getUint32(0, false);
        this.offset += 4;
    }

    readName() {
        this.chunk.name = new TextDecoder().decode(new Uint8Array(this.data, this.offset, 4));
        this.offset += 4;
    }

    readCRC() {
        this.chunk.crc32 = new DataView(this.data, this.offset, 4).getUint32(0, false);
        this.offset += 4;
    }

    readData() {
        this.chunk.data = new Uint8Array(this.data, this.offset, this.chunk.length);
        this.chunk.view = new DataView(this.data, this.offset, this.chunk.length);
        this.offset += this.chunk.length;
    }

    makeSlice() {
        this.chunks.push(this.chunk);
        this.chunk.slice = new Uint8Array(this.data, this.offset-this.chunk.length-4-4-4, this.chunk.length+4+4+4);
        this.chunk = new PNGChunk();
    }
}

//
let loadImage = async (url) => {
    let image = new Image();
    let promise = new Promise((resolve, reject) => {
        image.onload = ()=>{ resolve(image); };
        image.onerror = (e) => { reject(e); };
    });
    image.src = url;

    // FOR DEBUG!
    //image.width = 160;
    //image.height = 120;
    //image.alt = "Problematic";
    //document.body.appendChild(image);

    //
    return promise;
}

//
let saveBlob = (url, name) => {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href =  url;
    a.download = name;
    a.click();
    a.remove();
    return url;
}

//
let concat = (resultConstructor, ...arrays) => {
    let totalLength = 0;
    for (let arr of arrays) {
        totalLength += arr.length;
    }
    let result = new resultConstructor(totalLength);
    let offset = 0;
    for (let arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

//
let encodeURL = (chunked, type) => {
    return URL.createObjectURL(new Blob(chunked, {type}));
    //return `data:${type};base64,${btoa(String.fromCharCode(...concat(Uint8Array, ...chunked)))}`;
}

//
let toBlob = (canvas, mimeType, quality) => {
    return new Promise((resolve, reject)=>{
        canvas.toBlob(resolve, mimeType, quality);
    });
}

//
class InjectPNG {
    constructor(chunks, header) {
        // import ancilary data 
        this.PNGsignature = new Uint8Array([137,80,78,71,13,10,26,10]);
        this.chunks = chunks.filter((chunk)=>{ return chunk.name != "JHDR" && chunk.name != "JDAT" && chunk.name != "JDAA" && chunk.name != "JEND" && chunk.name != "IEND" && chunk.name != "IDAT";});
        this.header = header;
    }

    inject() {
        let IHDRi = this.reader.chunks.findIndex((chunk)=>{return chunk.name == "IHDR";});
        //let IDATi = this.chunks.findIndex((chunk)=>{return chunk.name == "IDAT";});
        this.reader.chunks.splice(IHDRi+1, 0, ...this.chunks);
        return this;
    }

    recode(binPNG) {
        this.reader = new DataReader(binPNG);
        this.reader.readSignature();
        this.PNGsignature = new Uint8Array([137,80,78,71,13,10,26,10]);
        while (this.reader.offset < this.reader.data.byteLength) {
            this.reader.readLength();
            this.reader.readName();
            this.reader.readData();
            this.reader.readCRC();
            this.reader.makeSlice();
        }
        
        return loadImage(encodeURL([this.PNGsignature, ...this.inject().reader.chunks.filter((chunk)=>{
            return chunk.name == "IHDR" || chunk.name == "IDAT" || chunk.name == "IEND";
        }).map((chunk)=>{
            return chunk.slice;
        })], "image/png"));
    }

    encode(pixelData) {
        // make operation much faster
        return this.recode(UPNG.encode([pixelData], this.header.width, this.header.height, 0));
    }
}

// for JNG alpha channel
class ReconstructPNG {
    constructor(chunks, header) {
        this.PNGsignature = new Uint8Array([137,80,78,71,13,10,26,10]);
        this.chunks = chunks.filter((chunk)=>{
            //chunk.name != "JHDR" && 
            //chunk.name != "JDAT" && 
            //chunk.name != "JDAA" && 
            //chunk.name != "JEND"
            return chunk.name == "IDAT";
        });
        this.header = header;
    }

    encodeIHDR() {
        var IHDR = new PNGChunk();
        var data = new ArrayBuffer(13+4+4+4);
        IHDR.length = 13;
        IHDR.name = "IHDR";
        IHDR.data = new Uint8Array(data, 8, 13);
        IHDR.view = new DataView(data, 8, 13);
        IHDR.view.setUint32(0, this.header.width, false);
        IHDR.view.setUint32(4, this.header.height, false);
        IHDR.view.setUint8(8, this.header.bitDepth, false);
        IHDR.view.setUint8(9, 0, false);
        IHDR.view.setUint8(10, 0, false);
        IHDR.view.setUint8(11, this.filter, false);
        IHDR.view.setUint8(12, this.interlace, false);
        IHDR.slice = new Uint8Array(data);
        this.chunks.splice(0, 0, IHDR.compile());
        return this;
    }

    encodeIEND() {
        var IEND = new PNGChunk();
        var data = new ArrayBuffer(0+4+4+4);
        IEND.length = 0;
        IEND.slice = new Uint8Array(data);
        IEND.name = "IEND";
        this.chunks.push(IEND.compile());
        return this;
    }

    encode() {
        this.encodeIHDR();
        this.encodeIEND();
        return loadImage(encodeURL([/*[this.concat(Uint8Array, JPEGc)]*/this.PNGsignature, ...this.chunks.map((chunk)=>{
            return chunk.slice;
        })], "image/png"));
    }
}

class Compositor {
    constructor() {
        
    }

    async init(W,H) {
        this.W = W, this.H = H;
        
        //
        const canvas = new OffscreenCanvas(W, H);
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const context = canvas.getContext('webgpu', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
        });
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat ? navigator.gpu.getPreferredCanvasFormat() : 'rgba8unorm';

        //
        this.canvas = canvas;
        this.context = context;
        this.device = device;
        this.adapter = adapter;
        this.presentationFormat = presentationFormat;

        //
        context.configure({
            device,
            format: presentationFormat,
            alphaMode: 'premultiplied',
        });
        
        //
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                {binding: 0, visibility: 0x2, sampler: { type: "filtering" } },
                {binding: 1, visibility: 0x2, texture: { access: "read-only", format: "rgba8unorm", viewDimension: "2d" } },
                {binding: 2, visibility: 0x2, texture: { access: "read-only", format: "rgba8unorm", viewDimension: "2d" } }
            ]
        });
        
        //
        const clearGroupLayout = device.createBindGroupLayout({
            entries: [
            ]
        });

        //
        this.posBufData = new Float32Array([
            -1.0,  1.0,
             1.0,  1.0,
            -1.0, -1.0,

            -1.0, -1.0,
             1.0,  1.0,
             1.0, -1.0,
        ]);
        this.posBuf = device.createBuffer({
            size: this.posBufData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(
          this.posBuf,
          0,
          this.posBufData.buffer,
          this.posBufData.byteOffset,
          this.posBufData.byteLength
        );
        
        //
        this.texBufData = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,

            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0,
        ]);
        this.texBuf = device.createBuffer({
            size: this.texBufData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(
          this.texBuf,
          0,
          this.texBufData.buffer,
          this.texBufData.byteOffset,
          this.texBufData.byteLength
        );

        //
        this.clearpip = device.createRenderPipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [clearGroupLayout]
            }),
            vertex: {
                buffers: [{
                    arrayStride: 4*2,
                    attributes: [{ // position
                          shaderLocation: 0,
                          offset: 0,
                          format: 'float32x2',
                    }],
                }],
                module: device.createShaderModule({ code: `
                struct VertexOutput {
                    @builtin(position) Position : vec4<f32>,
                }
                
                @vertex
                fn main(
                    @location(0) position : vec2<f32>,
                    @builtin(vertex_index) vIndex: u32,
                ) -> VertexOutput {
                    var output : VertexOutput;
                    output.Position = vec4<f32>(position, 0.0, 1.0);
                    return output;
                }
                ` }),
                entryPoint: 'main',
            },
            fragment: {
                module: device.createShaderModule({ code: `
                @fragment
                fn main() -> @location(0) vec4<f32> {
                    return vec4<f32>(0.0f, 0.0f, 0.0f, 0.0f);
                }
` }),
                entryPoint: 'main',
                targets: [{ format: presentationFormat, blend: {
                    color: {
                        operation: "add",
                        srcFactor: "zero",
                        dstFactor: "zero"
                    },
                    alpha: {
                        operation: "add",
                        srcFactor: "zero",
                        dstFactor: "zero"
                    }
                } }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        //
        this.pipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            vertex: {
                buffers: [{
                    arrayStride: 4*2,
                    attributes: [{ // position
                          shaderLocation: 0,
                          offset: 0,
                          format: 'float32x2',
                    }],
                }, {
                    arrayStride: 4*2,
                    attributes: [{ // UV
                          shaderLocation: 1,
                          offset: 0,
                          format: 'float32x2',
                    }],
                }],
                module: device.createShaderModule({ code: `
                struct VertexOutput {
                    @builtin(position) Position : vec4<f32>,
                    @location(0) fragUV : vec2<f32>,
                }
                
                @vertex
                fn main(
                    @location(0) position : vec2<f32>,
                    @location(1) uv : vec2<f32>,
                    @builtin(vertex_index) vIndex: u32,
                ) -> VertexOutput {
                    var output : VertexOutput;
                    output.Position = vec4<f32>(position, 0.0, 1.0); 
                    output.fragUV = uv;
                    return output;
                }
                ` }),
                entryPoint: 'main',
            },
            fragment: {
                module: device.createShaderModule({ code: `
                @group(0) @binding(0) var eSampler: sampler;
                @group(0) @binding(1) var RGBtex: texture_2d<f32>;
                @group(0) @binding(2) var Atex: texture_2d<f32>;
                
                @fragment
                fn main(
                    @location(0) fragUV: vec2<f32>
                ) -> @location(0) vec4<f32> {
                    return vec4<f32>(textureSample(RGBtex, eSampler, fragUV).xyz, textureSample(Atex, eSampler, fragUV).x);
                }
` }),
                entryPoint: 'main',
                targets: [{ format: presentationFormat, blend: {
                    color: {
                        operation: "add",
                        srcFactor: "one",
                        dstFactor: "one"
                    },
                    alpha: {
                        operation: "add",
                        srcFactor: "one",
                        dstFactor: "one"
                    }
                } }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        return this;
    }

    // composite for PNG encoding
    async composite(RGBp, Ap) {
        const device = this.device;
        const context = this.context;
        const canvas = this.canvas;

        //
        const RGB = await createImageBitmap(await RGBp);
        const A = await createImageBitmap(await Ap);
        
        //
        const RGBtex = device.createTexture({
            size: [RGB.width, RGB.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const Atex = device.createTexture({
            size: [A.width, A.height, 1],
            format: 'r8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        //
        device.queue.copyExternalImageToTexture({ source: RGB }, { texture: RGBtex }, [RGB.width, RGB.height]);
        device.queue.copyExternalImageToTexture({ source: A }, { texture: Atex }, [A.width, A.height]);

        //
        const textureView = context.getCurrentTexture().createView();
        
        //
        const uniformBufferSize = 8;
        const uniformBuffer = device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        //
        const sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        //
        const uniformBindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sampler,
                    visibility: 0x3
                },
                {
                    binding: 1,
                    resource: RGBtex.createView(),
                    visibility: 0x3
                },
                {
                    binding: 2,
                    resource: Atex.createView(),
                    visibility: 0x3
                },
            ],
        });
        
        //
        const clearBindGroup = device.createBindGroup({
            layout: this.clearpip.getBindGroupLayout(0),
            entries: [],
        });
        
        //
        var SIZE = new Uint32Array([this.W, this.H]);
        device.queue.writeBuffer(
            uniformBuffer, 0,
            SIZE.buffer,
            SIZE.byteOffset,
            SIZE.byteLength
        );

        //
        const commandEncoder = device.createCommandEncoder();
        const renderPassDescriptor = { colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'load',
                storeOp: 'store',
                loadValue: 'load',
            },
        ]};
        const clearPassDescriptor = { colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'load',
                storeOp: 'store',
                loadValue: 'load',
            },
        ]};

        //
        const clearEncoder = commandEncoder.beginRenderPass(clearPassDescriptor);
        clearEncoder.setVertexBuffer(0, this.posBuf);
        clearEncoder.setPipeline(this.clearpip);
        clearEncoder.setBindGroup(0, clearBindGroup);
        clearEncoder.draw(6, 1, 0, 0);
        if (clearEncoder.end) { clearEncoder.end(); }

        //
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setVertexBuffer(0, this.posBuf);
        passEncoder.setVertexBuffer(1, this.texBuf);
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        if (passEncoder.end) { passEncoder.end(); }
        
        //
        device.queue.submit([commandEncoder.finish()]);
        
        //
        if (device.queue.onSubmittedWorkDone) { await device.queue.onSubmittedWorkDone(); } //else { await new Promise(requestAnimationFrame); }

        // encode as raw PNG image
        /*const blob = await (canvas.convertToBlob || canvas.toBlob).call(canvas, {type: "image/png"});
        const FR = new FileReader();
        FR.readAsArrayBuffer(blob);
        const READ = new Promise(resolve => {
            FR.onload = ()=>resolve(FR.result);
        });
        return await READ;*/

        return canvas;//canvas.transferToImageBitmap();
    }
}

class OpenJNG {
    constructor() {
        this.JNGSignature = new Uint8Array([ 0x8b, 0x4a, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ]);
        this.header = {
            width: 0,
            height: 0, 
            bitDepth: 8,
        }
        this.alphaHeader = {
            width: 0,
            height: 0, 
            bitDepth: 8,
            filter: 0,
            compression: 0,
            interlace: 0
        }
        this.A = null;
        this.RGB = null;
    }

    compare(a, b) {
        for (let i = a.length; -1 < i; i -= 1) {
          if ((a[i] !== b[i])) return false;
        }
        return true;
    }

    equal32(a, b) {
        const ua = new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4);
        const ub = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
        return this.compare(ua, ub);
    }
    
    checkSignature() {
        return this.equal32(this.reader.signature, this.JNGSignature);
    }
    
    concat(resultConstructor, ...arrays) {
        let totalLength = 0;
        for (let arr of arrays) {
            totalLength += arr.length;
        }
        let result = new resultConstructor(totalLength);
        let offset = 0;
        for (let arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    readImage() {
        this.reader.readSignature();
        while (this.reader.offset < this.reader.data.byteLength) {
            this.reader.readLength();
            this.reader.readName();
            this.reader.readData();
            this.reader.readCRC();
            this.reader.makeSlice();
        }
        this.readHeader();

        //
        if (this.checkSignature()) {
            this.RGB = this.concatJDAT();
            {
                if (this.alphaHeader.compression == 8 && this.alphaHeader.bitDepth > 0 || this.reader.chunks.find((chunk)=>{return chunk.name == "JDAA" || chunk.name == "JdAA";})) { this.A = this.concatJDAA(); } else
                if (this.alphaHeader.compression == 0 && this.alphaHeader.bitDepth > 0 || this.reader.chunks.find((chunk)=>{return chunk.name == "IDAT";})) { this.A = this.reconstructPNG(); };
            }
        }
        
        //
        return this;
    }
    
    readHeader() {
        var header = this.reader.chunks.find((chunk)=>{ return chunk.name === "JHDR"; });
        this.alphaHeader.width = this.header.width = header.view.getUint32(0, false);
        this.alphaHeader.height = this.header.height = header.view.getUint32(4, false);
        this.alphaHeader.bitDepth = header.view.getUint8(12, false);
        this.alphaHeader.compression = header.view.getUint8(13, false);
        this.alphaHeader.filter = header.view.getUint8(14, false);
        this.alphaHeader.interlace = header.view.getUint8(15, false);
    }
    
    async load(URL) {
        let response = await fetch(URL);
        if (response.ok) {
            this.reader = new DataReader(await response.arrayBuffer());
            this.readImage();
        } else {
            console.error("Error HTTP: " + response.status);
        }
        return this;
    }

    async reconstructPNG() {
        return new ReconstructPNG(this.reader.chunks, this.alphaHeader).encode();
    }

    async concatJDAT() {
        var JDATs = this.reader.chunks.filter((chunk)=>{return chunk.name == "JDAT";});
        var JPEGc = JDATs.map((chunk)=>{ return chunk.data; });
        return loadImage(encodeURL(/*[this.concat(Uint8Array, JPEGc)]*/JPEGc, "image/jpeg"));
    }

    async concatJDAA() {
        var JDATs = this.reader.chunks.filter((chunk)=>{return chunk.name == "JDAA" || chunk.name == "JdAA";});
        var JPEGc = JDATs.map((chunk)=>{ return chunk.data; });
        return loadImage(encodeURL(/*[this.concat(Uint8Array, JPEGc)]*/JPEGc, "image/jpeg"));
    }

    async recodePNG() {
        if (this.checkSignature()) {
            let canvas = null;
            if (this.A) {
                var compositor = await (new Compositor().init(this.header.width, this.header.height));
                canvas = await compositor.composite(await this.RGB, await this.A);
            } else {
                canvas = new OffscreenCanvas(this.header.width, this.header.height);
                var ctx = canvas.getContext("2d");
                    ctx.clearRect(0, 0, this.header.width, this.header.height);
                    ctx.drawImage(await this.RGB, 0, 0);
            }

            //
            const blob = await (canvas.convertToBlob || canvas.toBlob).call(canvas, {type: "image/png"});
            const FR = new FileReader();
            FR.readAsArrayBuffer(blob);
            const READ = new Promise(resolve => {
                FR.onload = ()=>resolve(FR.result);
            });
            return await new InjectPNG(this.reader.chunks, this.header).recode(await READ);
        }
        return null;
    }

}
