
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

class EncodePNG {
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
        
        return loadImage(encodeURL([this.PNGsignature, ...this.inject().reader.chunks.map((chunk)=>{
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

        // their library is piece of sh&t, needs rewrite to WebGPU, and not waiting a (negative) answer
        let RGB_alpha = (RGB, A, OUT) => {
            return `
            var pos:vec2<u32> = vec2<u32>(thread.xy);
            var size:vec2u = vec2u(${this.W}, ${this.H});
            var L:u32 = pos.y*size.x + pos.x;
            if (pos.x < size.x && pos.y < size.y) {
                var rgb:vec4<f32> = RGB[pos.y][pos.x];
                var   a:vec4<f32> =   A[pos.y][pos.x];
                OUT[L]  =  u32(rgb.x*255.f)&0xFF;
                OUT[L] |= (u32(rgb.y*255.f)&0xFF)<<8;
                OUT[L] |= (u32(rgb.z*255.f)&0xFF)<<16;
                OUT[L] |= (u32(a.x*255.f)&0xFF)<<24;
            }
            `;
        }
        
        this.webCS = await WebCS.create({width:W, height:H});
        this.kernel = this.webCS.createShader(RGB_alpha,
            { local_size: [16, 16, 1], groups: [Math.ceil(W/16), Math.ceil(H/16), 1], params: { 
                'RGB': '[][]', 
                'A': '[][]',
                'OUT': 'u32[]'
            }});
        return this;
    }

    // composite for PNG encoding
    async composite(RGB, A) {
        let OUT = this.webCS.createBuffer(this.W*this.H*4);
        let INPUT = { RGB, A, OUT };
        await this.kernel.run(INPUT.RGB, INPUT.A, INPUT.OUT);

        //new Uint8Array(this.W*this.H*4);
        var RGBA8OUT = this.webCS.getData(OUT, "uint8");
        return RGBA8OUT;
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
        return compare(ua, ub);
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
        this.RGB = this.concatJDAT();
        if (this.alphaHeader.bitDepth > 0) {
            if (this.alphaHeader.compression == 8) { this.A = this.concatJDAA(); } else
            if (this.alphaHeader.compression == 0) { this.A = this.reconstructPNG(); };
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

    async reconstructPNG() {
        return new ReconstructPNG(this.reader.chunks, this.alphaHeader).encode();
    }

    async concatJDAT() {
        var JDATs = this.reader.chunks.filter((chunk)=>{return chunk.name == "JDAT";});
        var JPEGc = JDATs.map((chunk)=>{ return chunk.data; });
        return loadImage(encodeURL(/*[this.concat(Uint8Array, JPEGc)]*/JPEGc, "image/jpeg"));
    }

    async concatJDAA() {
        var JDATs = this.reader.chunks.filter((chunk)=>{return chunk.name == "JDAA";});
        var JPEGc = JDATs.map((chunk)=>{ return chunk.data; });
        return loadImage(encodeURL(/*[this.concat(Uint8Array, JPEGc)]*/JPEGc, "image/jpeg"));
    }

    checkSignature() {
        return equal32(this.reader.signature, this.JNGSignature);
    }

    async recodePNG() {
        if (this.A) {
            var compositor = await (new Compositor().init(this.header.width, this.header.height));
            var pixelData = await compositor.composite(await this.RGB, await this.A);
            return new EncodePNG(this.reader.chunks, this.header).encode(pixelData);
        } else {
            let canvas = document.createElement("canvas");
            canvas.width  = this.header.width;
            canvas.height = this.header.height;
            let ctx = canvas.getContext("2d");
            ctx.drawImage(await this.RGB, 0, 0);

            //
            let rawPNG = canvas.toDataURL("image/png", 0).replace(/^data:image\/png;base64,/, "");
            let binPNG = Uint8Array.from(atob(rawPNG), c => c.charCodeAt(0)).buffer;
            return new EncodePNG(this.reader.chunks, this.header).recode(binPNG);
        }
    }

}
