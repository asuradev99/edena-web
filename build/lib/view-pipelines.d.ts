type Pipelines = {
    bindGroupLayout: GPUBindGroupLayout;
    pipeline: GPURenderPipeline;
    pipelineColored: GPURenderPipeline;
    translucent: GPURenderPipeline;
    translucentColored: GPURenderPipeline;
};
/** Views on the same device share immutable pipeline state. */
export declare function viewPipelines(device: GPUDevice, format: GPUTextureFormat, samples: number): Pipelines;
export {};
