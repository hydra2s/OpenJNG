# OpenJNG

Reincarnation of my oldest project, for Open JNG format in JS and browser. 

### What is JNG?

JNG - JPEG Network Graphics. If be simply, it's JPEG (wrapper) with alpha channel support (PNG or JPG grayscale data). Also support ancillary chunks from PNG.

- https://ru.wikipedia.org/wiki/JNG
- https://en.wikipedia.org/wiki/JPEG_Network_Graphics
- http://www.libpng.org/pub/mng/spec/jng.html

### What I did?

After my 10 years... I decoded (again) JNG data through JPG and PNG browser's native decoders (despite in internets already has JS-based decoders), and composited (RGB and alpha) in WebGPU (for reduce overheads). Now decodes almost blazing fast, even relatively big images. And recoded back into PNG with saving JNG's ancillary chunks.

Yes, I learned almost everything about these things. About 2D context. About WebGL. About WebGPU (begin learning, but good know Vulkan API). About pixels and shaders. About composition and blending. About multi-theading and atomics. About SIMD. About PNG chunks, structs, binary data, difference between view and copy... and giving almost final answer about JNG decoding (except interlacing).
