struct ClampParams { texel: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: ClampParams;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var gmax = 0.0;
  for (var i: u32 = 0u; i < 5u; i = i + 1u) {
    let off = f32(i) - 2.0;
    let c = textureSample(srcTex, samp, uv + vec2<f32>(0.0, off) * params.texel);
    gmax = max(gmax, c.x);
  }
  return vec4<f32>(gmax, 0.0, 0.0, 0.0);
}
