export declare class Mipmaps {
    private device;
    private pipeline;
    private sampler;
    private levels;
    constructor(device: GPUDevice);
    generate(encoder: GPUCommandEncoder, texture: GPUTexture): void;
}
export declare function mipmaps(device: GPUDevice): Mipmaps;
