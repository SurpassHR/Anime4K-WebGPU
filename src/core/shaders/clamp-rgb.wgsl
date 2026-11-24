@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var statsTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(srcTex, samp, uv);
  let l = dot(c.rgb, vec3<f32>(0.299, 0.587, 0.114));
  let m = textureSample(statsTex, samp, uv).x;
  let nl = min(l, m);
  return vec4<f32>(c.rgb - vec3<f32>(l - nl), 1.0);
}
