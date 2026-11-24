struct Params {
  bias: vec4<f32>,
  texel: vec2<f32>,
  split: u32,
  residual: u32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var residualTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<storage, read> weights: array<vec4<f32>>;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var acc = params.bias;
  for (var tap: u32 = 0u; tap < 9u; tap = tap + 1u) {
    let ox = f32(tap % 3u) - 1.0;
    let oy = f32(tap / 3u) - 1.0;
    let c = textureSample(srcTex, samp, uv + vec2<f32>(ox, oy) * params.texel);
    let pos = max(c, vec4<f32>(0.0));
    acc.x = acc.x + dot(weights[tap * 4u + 0u], pos);
    acc.y = acc.y + dot(weights[tap * 4u + 1u], pos);
    acc.z = acc.z + dot(weights[tap * 4u + 2u], pos);
    acc.w = acc.w + dot(weights[tap * 4u + 3u], pos);
    if (params.split != 0u) {
      let neg = max(-c, vec4<f32>(0.0));
      acc.x = acc.x + dot(weights[36u + tap * 4u + 0u], neg);
      acc.y = acc.y + dot(weights[36u + tap * 4u + 1u], neg);
      acc.z = acc.z + dot(weights[36u + tap * 4u + 2u], neg);
      acc.w = acc.w + dot(weights[36u + tap * 4u + 3u], neg);
    }
  }
  if (params.residual != 0u) {
    acc = acc + textureSample(residualTex, samp, uv);
  }
  return acc;
}
