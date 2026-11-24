struct DSParams { lowTexel: vec2<f32>, lowSize: vec2<f32> };
@group(0) @binding(0) var lowTex: texture_2d<f32>;
@group(0) @binding(1) var mainTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: DSParams;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let f = fract(uv * params.lowSize);
  let i = vec2<u32>(f * 2.0);
  let idx = i.y * 2u + i.x;
  let base = (vec2<f32>(0.5) - f) * params.lowTexel + uv;
  let c = textureSample(lowTex, samp, base);
  var v = 0.0;
  if (idx == 0u) { v = c.r; }
  else if (idx == 1u) { v = c.g; }
  else if (idx == 2u) { v = c.b; }
  else { v = c.a; }
  return vec4<f32>(v, v, v, 0.0) + textureSample(mainTex, samp, uv);
}
